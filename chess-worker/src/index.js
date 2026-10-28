// Linework Chess — game rooms on Cloudflare. One Durable Object per game, holding the moves
// and talking to both players over WebSockets. Deployed by .github/workflows/chess-worker.yml.
//
//   GET /room/<id>   (WebSocket upgrade)  join or watch game <id>
//   GET /health                            "ok"
//
// Env: ROOMS (Durable Object binding), ALLOWED_ORIGIN (your site, e.g. https://you.github.io;
// a comma-separated list is fine).

import { RoomCore } from '../../js/chess-room.js';

const ROOM_ID = /^[A-Za-z0-9]{6,16}$/;
const EXPIRE_MS = 14 * 24 * 3600 * 1000; // rooms are deleted two weeks after the last move

const normOrigin = (o) => String(o || '').trim().replace(/\/+$/, '').toLowerCase();
function originAllowed(request, env) {
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map(normOrigin).filter(Boolean);
  if (!allowed.length) return true;
  const origin = normOrigin(request.headers.get('Origin'));
  return allowed.some((a) => origin === a || origin.startsWith(`${a}/`) || (a.startsWith('http') && origin === new URL(a).origin));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    const m = url.pathname.match(/^\/room\/([^/]+)$/);
    if (!m) return new Response('Linework Chess rooms. Open a game from the Linework site.', { status: 404 });
    if (!ROOM_ID.test(m[1])) return new Response('Bad room id', { status: 400 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (!originAllowed(request, env)) return new Response(`Games are only open from the Linework site (got ${request.headers.get('Origin') || 'no origin'})`, { status: 403 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    return stub.fetch(request);
  },
};

export class ChessRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    // Keep-alive pings are answered without waking the room.
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}')); } catch { /* older runtime */ }
    ctx.blockConcurrencyWhile(async () => {
      this.room = new RoomCore(await ctx.storage.get('room'));
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const joined = this.room.join({ token: url.searchParams.get('token') || '', want: url.searchParams.get('want') || '' });
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ token: joined.token });
    if (joined.changed) await this.save();
    server.send(JSON.stringify({ t: 'you', color: joined.color, token: joined.token }));
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  colorOf(ws) {
    const { token } = ws.deserializeAttachment() || {};
    if (!token) return null;
    return this.room.seats.w === token ? 'w' : this.room.seats.b === token ? 'b' : null;
  }

  // Sockets still open (a closing one can linger in the list for a moment).
  sockets(except) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === 1);
  }

  online(except) {
    const on = { w: false, b: false };
    for (const ws of this.sockets(except)) { const c = this.colorOf(ws); if (c) on[c] = true; }
    return on;
  }

  broadcast(extra, except) {
    const snap = JSON.stringify(this.room.snapshot(this.online(except)));
    for (const ws of this.sockets(except)) {
      try {
        if (extra) ws.send(JSON.stringify({ t: 'you', color: this.colorOf(ws), token: (ws.deserializeAttachment() || {}).token || null }));
        ws.send(snap);
      } catch { /* closing */ }
    }
  }

  async save() {
    await this.ctx.storage.put('room', this.room.toJSON());
    await this.ctx.storage.setAlarm(Date.now() + EXPIRE_MS);
  }

  async webSocketMessage(ws, data) {
    let msg;
    try { msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)); } catch { return; }
    if (msg?.t === 'ping') { ws.send('{"t":"pong"}'); return; }
    const res = this.room.handle(this.colorOf(ws), msg);
    if (res.error) { ws.send(JSON.stringify({ t: 'error', message: res.error })); return; }
    if (res.changed) { await this.save(); this.broadcast(res.swapped); }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code); } catch { /* already closed */ }
    this.broadcast(false, ws);
  }

  async webSocketError(ws) {
    this.broadcast(false, ws);
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
