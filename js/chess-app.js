// Linework Chess — the page: create or join a game by link, play on a tap-to-move board,
// and watch the position turn into a record after every move.

import { Game, sqName, colorOf, encodeGame, toFen } from './chess.js';

const fenOf = (pos, counters = true) => toFen(pos, { counters });
import { analyzeGame, CHESS_DIM_LABELS } from './chess-read.js';
import { pieceSvg, boardSvg } from './chess-board.js';
import { DIMS, MOTIF_LABELS } from './analyze.js';
import { matchRelease, loadCatalog } from './catalog.js';
import * as config from '../config.js';
import { RoomCore } from './chess-room.js';
import { LEVELS } from './chess-engine.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const POST_URL = config.POST_URL || '';
const TURNSTILE_SITEKEY = config.TURNSTILE_SITEKEY || '';
const SIDE_NAME = { w: 'White', b: 'Black' };

// ---------- Where the rooms live ----------
// config.CHESS_URL if set; otherwise the relay's address with the worker name swapped for
// "linework-chess" (both live on the same workers.dev subdomain).
function roomBase() {
  const raw = config.CHESS_URL || '';
  try {
    if (raw) return new URL(raw);
    if (!POST_URL) return null;
    const u = new URL(/^https?:\/\//.test(POST_URL) ? POST_URL : `https://${POST_URL}`);
    const parts = u.hostname.split('.');
    if (!u.hostname.endsWith('.workers.dev') || parts.length < 4) return null;
    parts[0] = 'linework-chess';
    return new URL(`${u.protocol}//${parts.join('.')}`);
  } catch { return null; }
}
const BASE = roomBase();

// ---------- Saved seats (so a reload or a dropped connection keeps your side) ----------
const SEATS_KEY = 'linework.chess.seats';
const LAST_KEY = 'linework.chess.last';
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } },
};
const seatToken = (id) => store.get(SEATS_KEY, {})[id] || '';
function saveSeat(id, token) {
  const all = store.get(SEATS_KEY, {});
  if (token) all[id] = token; else delete all[id];
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete all[k];
  store.set(SEATS_KEY, all);
}

// ---------- State ----------
const S = {
  id: null, ws: null, me: null, want: 'w', server: null, game: new Game(), pending: null,
  selected: null, retry: 0, catalog: null, lastReading: null, showReading: false, closedByUs: false,
};
let catalogReady = loadCatalog().then((c) => { S.catalog = c; return c; });

// ---------- Lobby ----------
document.querySelectorAll('.side').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.side').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
}));

function randomId() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => abc[x % abc.length]).join('');
}

$('createBtn').addEventListener('click', () => {
  const pick = document.querySelector('.side[aria-checked="true"]')?.dataset.side || 'w';
  const want = pick === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : pick;
  const id = randomId();
  store.set(LAST_KEY, { id, want });
  location.hash = `g=${id}&as=${want}`;
});
document.querySelectorAll('.level').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.level').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
}));
$('cpuBtn').addEventListener('click', () => {
  const pick = document.querySelector('.side[aria-checked="true"]')?.dataset.side || 'w';
  const as = pick === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : pick;
  const level = document.querySelector('.level[aria-checked="true"]')?.dataset.level || 'medium';
  store.set(CPU_KEY, null); // a fresh game
  location.hash = `cpu=${level}&as=${as}`;
});
$('resumeCpuBtn').addEventListener('click', () => {
  const saved = store.get(CPU_KEY, null);
  if (saved) location.hash = `cpu=${saved.level}`;
});
$('resumeBtn').addEventListener('click', () => {
  const last = store.get(LAST_KEY, null);
  if (last?.id) location.hash = `g=${last.id}`;
});

function route() {
  const h = new URLSearchParams(location.hash.slice(1));
  const id = h.get('g');
  if (id && /^[A-Za-z0-9]{6,16}$/.test(id)) { enterGame(id, h.get('as')); return; }
  if (LEVELS[h.get('cpu')]) { enterComputer(h.get('cpu'), h.get('as')); return; }
  leaveGame();
  leaveComputer();
  $('lobby').hidden = false;
  $('game').hidden = true;
  const last = store.get(LAST_KEY, null);
  $('resumeBtn').hidden = !(last?.id && seatToken(last.id));
  const savedCpu = store.get(CPU_KEY, null);
  $('resumeCpuBtn').hidden = !(savedCpu?.room?.moves?.length && !new RoomCore(savedCpu.room).over());
  if (!BASE) {
    $('notReady').hidden = false;
    $('createBtn').disabled = true;
    $('lobbyNote').hidden = true;
  }
}
window.addEventListener('hashchange', route);

// ---------- Connection ----------
function enterGame(id, want) {
  if (S.id === id && S.ws) return;
  leaveGame();
  leaveComputer();
  S.id = id;
  S.want = want === 'b' ? 'b' : 'w';
  S.server = null;
  S.me = null;
  S.game = new Game();
  S.selected = null;
  S.showReading = false;
  S.round = null;
  S.wasOver = false;
  S.connected = false;
  S.diagnosed = false;
  $('connError').hidden = true;
  $('lobby').hidden = true;
  $('game').hidden = false;
  $('reading').hidden = true;
  const last = store.get(LAST_KEY, null);
  if (!last || last.id !== id) store.set(LAST_KEY, { id, want: S.want });
  // The invite link is just this page's address: show it straight away to whoever created the game.
  $('inviteLink').textContent = `${location.origin}${location.pathname}#g=${id}`;
  $('invite').hidden = !want;
  if (!BASE) { setTurn('Chess rooms aren’t switched on for this site yet.'); return; }
  renderAll();
  connect();
}

function leaveGame() {
  if (S.ws) { S.closedByUs = true; try { S.ws.close(); } catch { /* fine */ } }
  S.ws = null;
  S.id = null;
  clearInterval(S.ping);
}

function connect() {
  const id = S.id;
  const url = new URL(`/room/${id}`, BASE);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  url.searchParams.set('token', seatToken(id));
  url.searchParams.set('want', S.want);
  let ws;
  try { ws = new WebSocket(url); } catch { scheduleReconnect(); return; }
  S.ws = ws;
  S.closedByUs = false;
  if (!S.server) setTurn('Connecting…');
  ws.onopen = () => {
    S.retry = 0;
    clearInterval(S.ping);
    S.ping = setInterval(() => { if (ws.readyState === 1) ws.send('{"t":"ping"}'); }, 25000);
  };
  ws.onmessage = (e) => {
    if (S.ws !== ws) return;
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'you') {
      S.me = m.color;
      if (m.token) saveSeat(id, m.token);
    } else if (m.t === 'state') {
      S.connected = true;
      $('connError').hidden = true;
      S.server = m;
      S.pending = null;
      adopt(m);
    } else if (m.t === 'error') {
      flash(m.message);
      S.pending = null;
      if (S.server) adopt(S.server);
    }
  };
  ws.onclose = () => {
    clearInterval(S.ping);
    if (S.ws !== ws) return;
    S.ws = null;
    if (!S.closedByUs && S.id === id) scheduleReconnect();
  };
}

function scheduleReconnect() {
  const wait = Math.min(15000, 600 * 2 ** S.retry++);
  setTurn(navigator.onLine === false ? 'Offline. Reconnecting when you’re back…' : S.connected ? 'Reconnecting…' : 'Can’t reach the game server yet. Retrying…');
  if (!S.connected && S.retry >= 2 && navigator.onLine !== false) diagnose();
  clearTimeout(S.reconnectTimer);
  S.reconnectTimer = setTimeout(() => { if (S.id && !S.ws) connect(); }, wait);
}
// Never got in: work out why, and say so (instead of “Connecting…” forever).
async function diagnose() {
  if (S.diagnosed) return;
  S.diagnosed = true;
  const host = BASE.host;
  let reachable = false;
  try {
    await fetch(new URL('/health', BASE), { mode: 'no-cors', cache: 'no-store' });
    reachable = true;
  } catch { /* nothing answered */ }
  const el = $('connError');
  el.innerHTML = reachable
    ? `The game server (<b>${esc(host)}</b>) is running but won’t accept games from this page (<b>${esc(location.origin)}</b>). Site owner: set the repository variable <code>CHESS_ALLOWED_ORIGIN</code> to this address and run “Deploy chess rooms” again.`
    : `Can’t reach the game server at <b>${esc(host)}</b>. Site owner: run <b>Actions → Deploy chess rooms</b> in GitHub (it needs the two Cloudflare secrets), then reload. If your rooms live at a different address, set <code>CHESS_URL</code> in config.js.`;
  el.hidden = false;
}

window.addEventListener('online', () => { if (S.id && !S.ws) connect(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.id && !S.ws) connect();
});

function send(msg) {
  if (S.cpu) { setTimeout(() => cpuReceive(msg), 0); return true; } // answered like a server, a moment later
  if (S.ws && S.ws.readyState === 1) { S.ws.send(JSON.stringify(msg)); return true; }
  flash('Not connected. Trying again…');
  return false;
}

// The server's moves are the truth; rebuild the local game from them.
function adopt(state) {
  // A new round (rematch): close the last game's reading.
  if (S.round !== state.round) {
    S.round = state.round;
    S.showReading = false;
    shownReadingKey = null;
    $('reading').hidden = true;
  }
  // The game just ended: the result replaces any passing note.
  if (state.over && !S.wasOver) { clearTimeout(flashTimer); flashTimer = null; $('turn').classList.remove('flash'); }
  S.wasOver = state.over;
  const same = state.moves.length === S.game.moves.length && state.moves.every((u, i) => u === S.game.moves[i]);
  if (!same) {
    try { S.game = new Game(state.moves); } catch { S.game = new Game(); }
    S.selected = null;
  }
  renderAll();
}

// ---------- Playing the computer ----------
// Same room rules as an online game (chess-room.js), run here; the engine thinks in a worker.
const CPU_KEY = 'linework.chess.cpu';
let engine = null;
let engineSeq = 0;
const engineWaiting = new Map();

function askEngine(msg) {
  if (!engine) {
    engine = new Worker(new URL('./chess-engine-worker.js', import.meta.url), { type: 'module' });
    engine.onmessage = (e) => { const done = engineWaiting.get(e.data.id); engineWaiting.delete(e.data.id); done?.(e.data); };
    engine.onerror = () => { for (const done of engineWaiting.values()) done({ t: 'error' }); engineWaiting.clear(); engine = null; };
  }
  const id = ++engineSeq;
  return new Promise((done) => { engineWaiting.set(id, done); engine.postMessage({ ...msg, id }); });
}

function cpuColor() {
  const c = S.cpu;
  return c.room.seats.w === c.botToken ? 'w' : 'b';
}

function enterComputer(level, as) {
  leaveGame();
  const saved = store.get(CPU_KEY, null);
  let c;
  if (saved?.room && saved.level === level && (!as || saved.as === as)) {
    c = { level, as: saved.as, room: new RoomCore(saved.room), myToken: saved.myToken, botToken: saved.botToken };
  } else {
    const room = new RoomCore();
    const me = room.join({ want: as === 'b' ? 'b' : 'w' });
    const bot = room.join({});
    c = { level, as: me.color, room, myToken: me.token, botToken: bot.token };
  }
  S.cpu = c;
  S.id = null;
  S.server = null;
  S.game = new Game();
  S.selected = null;
  S.pending = null;
  S.showReading = false;
  S.round = null;
  S.wasOver = false;
  S.thinking = false;
  $('connError').hidden = true;
  $('invite').hidden = true;
  $('lobby').hidden = true;
  $('game').hidden = false;
  $('reading').hidden = true;
  cpuPublish();
}

function leaveComputer() {
  if (!S.cpu) return;
  S.cpu = null;
  S.thinking = false;
  engineSeq++; // ignore a reply still on its way
}

function cpuSave() {
  const c = S.cpu;
  store.set(CPU_KEY, { level: c.level, as: c.as, room: c.room.toJSON(), myToken: c.myToken, botToken: c.botToken });
}

// Shows the local room as if a server had sent it, then lets the computer move if it's its turn.
function cpuPublish() {
  const c = S.cpu;
  S.me = c.room.seats.w === c.myToken ? 'w' : 'b';
  S.server = c.room.snapshot({ w: true, b: true });
  S.pending = null;
  adopt(S.server);
  cpuSave();
  cpuMaybeMove();
}

function cpuReceive(msg) {
  const c = S.cpu;
  if (!c) return;
  const me = S.me;
  const res = c.room.handle(me, msg);
  if (res.error) { flash(res.error); S.pending = null; adopt(S.server); return; }
  if (msg.t === 'rematch' && !res.swapped) c.room.handle(cpuColor(), { t: 'rematch' }); // the computer always says yes
  if (msg.t === 'draw' && c.room.offer === me) {
    // Ask the computer about the offer.
    cpuPublish();
    const asked = c.room;
    askEngine({ t: 'draw', fen: toFenOf(S.game), level: c.level, cpu: cpuColor() }).then((r) => {
      if (S.cpu !== c || c.room !== asked || c.room.offer !== me) return;
      c.room.handle(cpuColor(), { t: r.accept ? 'draw' : 'decline' });
      cpuPublish();
      if (!r.accept) flash('The computer declines the draw.');
    });
    return;
  }
  cpuPublish();
}

const toFenOf = (game) => fenOf(game.pos);

async function cpuMaybeMove() {
  const c = S.cpu;
  if (!c || S.thinking || c.room.over()) return;
  const bot = cpuColor();
  if (c.room.game.turn !== bot) return;
  S.thinking = true;
  renderStatus();
  const ply = c.room.moves.length;
  const history = c.room.game.history.map((h) => fenOf(h.before, false)).concat(fenOf(c.room.game.pos, false));
  const started = Date.now();
  const r = await askEngine({ t: 'move', fen: fenOf(c.room.game.pos), level: c.level, history });
  await new Promise((res) => setTimeout(res, Math.max(0, 450 - (Date.now() - started)))); // don't answer instantly
  if (S.cpu !== c || c.room.moves.length !== ply) { if (S.cpu === c) S.thinking = false; return; }
  S.thinking = false;
  if (r?.uci) c.room.handle(bot, { t: 'move', uci: r.uci, ply });
  else if (!c.room.over()) c.room.handle(bot, { t: 'resign' }); // the engine failed: concede rather than hang
  cpuPublish();
}

// ---------- Board ----------
const boardEl = $('board');
let flipped = false;

function squaresInOrder() {
  const out = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const r = flipped ? row : 7 - row, f = flipped ? 7 - col : col;
    out.push(r * 8 + f);
  }
  return out;
}

function myTurn() {
  const st = S.server;
  return !!(st && S.me && !st.over && st.seated.w && st.seated.b && S.game.turn === S.me && !S.pending && !S.thinking);
}

function renderBoard() {
  flipped = S.me === 'b';
  const pos = S.game.pos;
  const last = S.game.history[S.game.history.length - 1]?.move;
  const status = S.game.status();
  const king = status.check ? pos.board.indexOf(pos.turn === 'w' ? 'K' : 'k') : -1;
  const targets = S.selected !== null ? S.game.legal().filter((m) => m.from === S.selected) : [];
  const order = squaresInOrder();
  boardEl.innerHTML = order.map((s, i) => {
    const r = s >> 3, f = s & 7;
    const cls = ['sq', (r + f) % 2 ? 'light' : 'dark'];
    if (last && (s === last.from || s === last.to)) cls.push('last');
    if (s === S.selected) cls.push('sel');
    const t = targets.find((m) => m.to === s);
    if (t) cls.push(t.captured ? 'can-take' : 'can-move');
    if (s === king) cls.push('check');
    const p = pos.board[s];
    const coordF = i >= 56 ? `<span class="coord f">${'abcdefgh'[f]}</span>` : '';
    const coordR = i % 8 === 0 ? `<span class="coord r">${r + 1}</span>` : '';
    const label = `${sqName(s)}${p ? `, ${colorOf(p) === 'w' ? 'white' : 'black'} ${({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' })[p.toLowerCase()]}` : ''}`;
    return `<button type="button" class="${cls.join(' ')}" data-s="${s}" role="gridcell" aria-label="${label}">${coordF}${coordR}${p ? pieceSvg(p) : ''}</button>`;
  }).join('');
  boardEl.classList.toggle('active', myTurn());
}

boardEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.sq');
  if (!btn) return;
  const s = Number(btn.dataset.s);
  if (!myTurn()) {
    if (S.server && !S.server.over && S.me && S.server.seated.w && S.server.seated.b) flash('Wait for your opponent’s move.');
    return;
  }
  const p = S.game.pos.board[s];
  if (S.selected !== null) {
    const moves = S.game.legal().filter((m) => m.from === S.selected && m.to === s);
    if (moves.length) {
      if (moves[0].promotion) choosePromotion(moves[0]);
      else play(moves[0]);
      return;
    }
  }
  S.selected = p && colorOf(p) === S.me && S.selected !== s ? s : null;
  renderBoard();
});

function choosePromotion(m) {
  const dlg = $('promo');
  $('promoRow').innerHTML = ['q', 'r', 'b', 'n'].map((k) => {
    const p = S.me === 'w' ? k.toUpperCase() : k;
    return `<button type="button" class="promo-btn" data-k="${k}" aria-label="${({ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' })[k]}">${pieceSvg(p)}</button>`;
  }).join('');
  dlg.onclick = (e) => {
    const b = e.target.closest('.promo-btn');
    if (b) { dlg.close(); play({ ...m, promotion: b.dataset.k }); } else if (e.target === dlg) dlg.close();
  };
  dlg.showModal();
}

function play(m) {
  const uci = sqName(m.from) + sqName(m.to) + (m.promotion || '');
  const ply = S.game.moves.length;
  if (!send({ t: 'move', uci, ply })) return;
  S.game.play(uci); // shown straight away; the server confirms
  S.pending = uci;
  S.selected = null;
  renderAll();
}

// ---------- Everything else on screen ----------
function resultText(st) {
  if (!st?.over) return '';
  const winner = st.result === '1-0' ? 'White' : st.result === '0-1' ? 'Black' : null;
  const youWon = winner && S.me && SIDE_NAME[S.me] === winner;
  const tail = winner ? (S.me ? (youWon ? ' You win.' : ' You lose.') : ` ${winner} wins.`) : '';
  switch (st.reason) {
    case 'checkmate': return `Checkmate.${tail}`;
    case 'resign': return `${winner === 'White' ? 'Black' : 'White'} resigned.${tail}`;
    case 'draw': return 'Draw agreed.';
    case 'stalemate': return 'Stalemate. A draw.';
    case 'threefold': return 'Threefold repetition. A draw.';
    case 'fifty': return 'Fifty moves without a capture or pawn move. A draw.';
    case 'insufficient': return 'Not enough pieces left to mate. A draw.';
    default: return 'Game over.';
  }
}

function setTurn(text) { $('turn').textContent = text; }

let flashTimer = null;
function flash(text) {
  const el = $('turn');
  el.textContent = text;
  el.classList.add('flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.classList.remove('flash'); renderStatus(); }, 1800);
}

function renderStatus() {
  const st = S.server;
  if (!st) return;
  const opp = S.me ? (S.me === 'w' ? 'b' : 'w') : null;
  // Players
  $('meSide').textContent = S.me ? SIDE_NAME[S.me] : 'Watching';
  $('meName').textContent = S.me ? 'You' : 'Spectator';
  if (opp && S.cpu) {
    $('oppSide').textContent = SIDE_NAME[opp];
    $('oppName').textContent = `Computer · ${LEVELS[S.cpu.level].label}`;
    $('oppDot').className = `dot on${S.thinking ? ' thinking' : ''}`;
    $('oppDot').title = S.thinking ? 'Thinking' : '';
  } else if (opp) {
    $('oppSide').textContent = SIDE_NAME[opp];
    $('oppName').textContent = st.seated[opp] ? 'Opponent' : 'Waiting for opponent';
    $('oppDot').className = `dot${st.online[opp] ? ' on' : ''}`;
    $('oppDot').title = st.online[opp] ? 'Online' : 'Offline';
  } else {
    $('oppSide').textContent = '';
    $('oppName').textContent = `White ${st.online.w ? '●' : '○'}  ·  Black ${st.online.b ? '●' : '○'}`;
    $('oppDot').className = 'dot';
  }
  // Invite
  if (!S.cpu) {
    $('invite').hidden = !(S.me && opp && !st.seated[opp]);
    $('inviteLink').textContent = `${location.origin}${location.pathname}#g=${S.id}`;
  }
  // Turn line
  if (flashTimer && $('turn').classList.contains('flash')) return;
  if (st.over) setTurn(resultText(st));
  else if (!S.me) setTurn(`${SIDE_NAME[S.game.turn]} to move.`);
  else if (!st.seated[opp]) setTurn('Waiting for your opponent to join…');
  else if (S.pending) setTurn('Sending…');
  else if (S.game.turn === S.me) setTurn(S.game.status().check ? 'Check! Your move.' : 'Your move.');
  else if (S.cpu) setTurn('The computer is thinking…');
  else setTurn(st.online[opp] ? 'Their move.' : 'Their move. They’re offline right now.');
  // Draw offer
  const offerFromThem = st.offer && st.offer !== S.me && S.me;
  $('offer').hidden = !offerFromThem || st.over;
  // Buttons
  const playing = S.me && !st.over && st.seated.w && st.seated.b;
  $('gameActions').hidden = !playing;
  $('drawBtn').textContent = st.offer === S.me ? 'Draw offered' : 'Offer draw';
  $('drawBtn').disabled = st.offer === S.me;
  $('endActions').hidden = !st.over;
  const rm = st.rematch || {};
  $('rematchBtn').hidden = !S.me;
  $('rematchBtn').disabled = !!(S.me && rm[S.me]);
  $('rematchBtn').querySelector('span').textContent = S.cpu ? 'Play again (swap sides)' : S.me && rm[S.me] ? 'Rematch asked, waiting…' : rm[opp] ? 'Accept rematch' : 'Rematch';
}

function renderMoves() {
  const h = S.game.history;
  let html = '';
  for (let i = 0; i < h.length; i += 2) {
    html += `<li><span class="mn">${i / 2 + 1}.</span> ${esc(h[i].san)}${h[i + 1] ? ` ${esc(h[i + 1].san)}` : ''}</li>`;
  }
  const el = $('moves');
  el.innerHTML = html;
  el.hidden = !h.length;
  el.scrollLeft = el.scrollWidth;
}

function renderAll() {
  renderBoard();
  renderMoves();
  renderStatus();
  updateReading();
}

// ---------- The music ----------
function currentEnd() {
  const e = S.server?.end;
  return e && S.server.moves.length === S.game.moves.length ? e : null;
}

let readSeq = 0;
async function updateReading() {
  const seq = ++readSeq;
  const catalog = S.catalog || await catalogReady;
  if (seq !== readSeq || !catalog) return;
  const moves = S.game.moves;
  const end = currentEnd();
  const a = analyzeGame(moves, end);
  const r = matchRelease(a, catalog);
  S.lastReading = { a, r, moves: moves.slice(), end };
  showLive(a, r);
  if (S.server?.over && !S.pending) S.showReading = true;
  if (S.showReading) renderReading();
}

const live = { el: $('live'), cover: $('liveCover'), motif: $('liveMotif'), title: $('liveTitle'), artist: $('liveArtist'), id: null };
function showLive(a, r) {
  if (!r) return;
  live.el.hidden = false;
  live.motif.textContent = a.motifLabel;
  if (r.id !== live.id) {
    live.id = r.id;
    live.title.textContent = r.name;
    live.artist.textContent = [r.artists, r.year].filter(Boolean).join(' · ');
    if (r.image) { live.cover.src = r.image; live.cover.hidden = false; } else live.cover.hidden = true;
    live.el.classList.remove('swap');
    void live.el.offsetWidth;
    live.el.classList.add('swap');
  }
}
live.el.addEventListener('click', () => {
  S.showReading = true;
  renderReading();
  $('reading').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function why(r, a) {
  const parts = [];
  const v = r.via;
  if (v) {
    const shape = (MOTIF_LABELS[v.motif] || v.motif).toLowerCase();
    const title = v.text === r.name ? 'The title' : `The track “${esc(v.text)}”`;
    if (v.kind === 'sound') parts.push(`Its ${esc(r.genre)} sound suits the position (${esc(shape)})`);
    else if (v.kind === 'hint') parts.push(`${title} hints at the position (${esc(shape)})`);
    else parts.push(`${title} ${v.motif === a.motif ? 'echoes' : 'is close to'} the position (${esc(shape)})`);
  }
  if (r.genre && v?.kind !== 'sound') parts.push(`${parts.length ? 'and its' : 'Its'} ${esc(r.genre)} sound sits closest to how the game was played`);
  else if (!parts.length) parts.push('Closest record to how the game was played');
  return `${parts.join(', ')}.`;
}

let shownReadingKey = null;
function renderReading() {
  const L = S.lastReading;
  if (!L) return;
  const { a, r } = L;
  $('reading').hidden = false;
  $('readingLabel').textContent = S.server?.over ? 'The final position reads as' : 'Right now the position reads as';
  $('motif').textContent = a.motifLabel;
  $('traits').textContent = a.traits.length ? a.traits.join(', ') : 'even-handed';
  $('meters').innerHTML = DIMS.map((d) => `<dt>${CHESS_DIM_LABELS[d]}</dt><dd><i style="width:${Math.max(2, a.features[d] * 100).toFixed(1)}%"></i></dd>`).join('');
  const cat = S.catalog;
  $('mapping').innerHTML = cat ? `Matching against <b>${cat.releases.length} records</b>${cat.source?.name ? ` from <b>${esc(cat.source.name)}</b>` : ''}` : '';
  const key = `${r?.id}|${L.moves.length}|${L.end}`;
  if (key === shownReadingKey) return;
  shownReadingKey = key;
  if (!r) { $('release').innerHTML = '<div class="notice"><p>The catalog is empty.</p></div>'; return; }
  const postable = !!(S.server?.over && POST_URL && L.moves.length);
  $('release').innerHTML = `<article class="card">
    <div class="card-head">
      ${r.image ? `<img class="cover" src="${esc(r.image)}" alt="Cover of ${esc(r.name)}">` : '<div class="cover"></div>'}
      <div>
        <p class="label">Your record</p>
        <h3>${esc(r.name)}</h3>
        <p class="artist">${esc(r.artists)}</p>
        <p class="meta">${[r.year].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
    </div>
    <iframe class="embed" title="Spotify player for ${esc(r.name)}" src="https://open.spotify.com/embed/album/${encodeURIComponent(r.id)}?utm_source=generator"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
    <p class="why">${why(r, a)}</p>
    <a class="submit accent" href="${esc(/^https:\/\/open\.spotify\.com\//.test(r.url || '') ? r.url : `https://open.spotify.com/album/${encodeURIComponent(r.id)}`)}" target="_blank" rel="noopener">Open in Spotify</a>
    ${postable ? '<button class="submit ghost" id="postBtn" type="button">Post to the feed</button>' : ''}
  </article>`;
  $('postBtn')?.addEventListener('click', openPost);
}

// ---------- Game buttons ----------
let resignArmed = null;
$('resignBtn').addEventListener('click', () => {
  if (!resignArmed) {
    $('resignBtn').textContent = 'Tap again to resign';
    $('resignBtn').classList.add('danger');
    resignArmed = setTimeout(() => { resignArmed = null; $('resignBtn').textContent = 'Resign'; $('resignBtn').classList.remove('danger'); }, 3000);
    return;
  }
  clearTimeout(resignArmed);
  resignArmed = null;
  $('resignBtn').textContent = 'Resign';
  $('resignBtn').classList.remove('danger');
  send({ t: 'resign' });
});
$('drawBtn').addEventListener('click', () => send({ t: 'draw' }));
$('acceptDraw').addEventListener('click', () => send({ t: 'draw' }));
$('declineDraw').addEventListener('click', () => send({ t: 'decline' }));
$('rematchBtn').addEventListener('click', () => {
  S.showReading = false;
  send({ t: 'rematch' });
});

$('copyLink').addEventListener('click', async () => {
  const text = $('inviteLink').textContent;
  try { await navigator.clipboard.writeText(text); $('copyLink').textContent = 'Copied'; } catch {
    const range = document.createRange(); range.selectNodeContents($('inviteLink'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }
  setTimeout(() => { $('copyLink').textContent = 'Copy'; }, 1500);
});
if (navigator.share) {
  $('shareLink').hidden = false;
  $('shareLink').addEventListener('click', () => {
    navigator.share({ title: 'Play me at chess on Linework', text: 'Your move. The board picks the music.', url: $('inviteLink').textContent }).catch(() => {});
  });
}

// ---------- Posting a finished game ----------
const post = {
  sheet: $('postSheet'), body: $('postBody'), done: $('postDone'), caption: $('postCaption'),
  error: $('postError'), send: $('postSend'), box: $('turnstileBox'),
};
let lastPost = null;
let turnstileToken = '';
let turnstileWidget = null;
const postedKey = 'linework.chess.posted';

function loadTurnstile() {
  if (!TURNSTILE_SITEKEY) return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve(window.turnstile || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

async function openPost() {
  const L = S.lastReading;
  if (!L?.r) return;
  const code = encodeGame(L.moves, L.end);
  if ((store.get(postedKey, [])).includes(code)) { flash('You’ve already posted this game.'); return; }
  lastPost = { code, a: L.a, r: L.r };
  const last = S.game.history[S.game.history.length - 1]?.move;
  $('postDrawing').innerHTML = boardSvg(S.game.pos.board, 120, { flip: S.me === 'b', marks: last ? { from: last.from, to: last.to } : null });
  $('postMotif').textContent = L.a.motifLabel;
  $('postRecord').innerHTML = `<b>${esc(L.r.name)}</b><br>${esc(L.r.artists)}`;
  post.caption.value = '';
  post.error.hidden = true;
  post.body.hidden = false;
  post.done.hidden = true;
  post.send.disabled = false;
  post.send.textContent = 'Post anonymously';
  post.sheet.showModal();
  const ts = await loadTurnstile();
  if (ts && turnstileWidget === null) {
    turnstileWidget = ts.render(post.box, { sitekey: TURNSTILE_SITEKEY, callback: (t) => { turnstileToken = t; } });
  } else if (ts && turnstileWidget !== null) { ts.reset(turnstileWidget); turnstileToken = ''; }
}

post.send.addEventListener('click', async () => {
  if (!lastPost) return;
  if (TURNSTILE_SITEKEY && !turnstileToken) { post.error.textContent = 'Please complete the check above first.'; post.error.hidden = false; return; }
  post.send.disabled = true;
  post.send.textContent = 'Posting…';
  post.error.hidden = true;
  const caption = post.caption.value.trim().slice(0, 140);
  try {
    const res = await fetch(POST_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: lastPost.code, caption, turnstile: turnstileToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Posting failed (${res.status}).`);
    const r = lastPost.r;
    try {
      const list = JSON.parse(localStorage.getItem('linework.pending') || '[]');
      list.unshift({ n: data.number, at: new Date().toISOString(), code: lastPost.code, caption, motif: lastPost.a.motif, motifLabel: lastPost.a.motifLabel,
        traits: lastPost.a.traits, release: { id: r.id, name: r.name, artists: r.artists, year: r.year, image: r.image, url: r.url } });
      localStorage.setItem('linework.pending', JSON.stringify(list.slice(0, 20)));
    } catch { /* fine */ }
    store.set(postedKey, [...store.get(postedKey, []), lastPost.code].slice(-50));
    lastPost = null;
    $('postBtn')?.remove();
    post.body.hidden = true;
    post.done.hidden = false;
  } catch (err) {
    post.error.textContent = err.message || 'Posting failed. Check your connection and try again.';
    post.error.hidden = false;
    post.send.disabled = false;
    post.send.textContent = 'Post anonymously';
    if (window.turnstile && turnstileWidget !== null) { window.turnstile.reset(turnstileWidget); turnstileToken = ''; }
  }
});
$('postCancel').addEventListener('click', () => post.sheet.close());
$('postClose').addEventListener('click', () => post.sheet.close());
post.sheet.addEventListener('click', (e) => { if (e.target === post.sheet) post.sheet.close(); });

route();
