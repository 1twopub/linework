// Linework relay — a Cloudflare Worker that turns anonymous posts into GitHub issues,
// and keeps each post's like count (a hidden counter in its issue).
//
// Routes:  POST /        new post          { code, caption, turnstile }
//          POST /like    like or unlike    { n, undo }
//          GET  /likes   current counts    → { likes: { "<issue number>": count } }
//
// It holds the only secret (a GitHub token) so the public site never has to.
// It stores nothing itself: each post becomes an issue in your repo, and a GitHub Action
// rebuilds feed.json from those issues. Nothing about the poster (IP, browser) is written anywhere.
//
// Settings (Worker → Settings → Variables and Secrets):
//   GITHUB_REPO       owner/repo                         (plain text)
//   ALLOWED_ORIGIN    https://owner.github.io            (plain text; your site's origin, no path;
//                     several allowed, separated by commas, e.g. for testing locally)
//   GITHUB_TOKEN      fine-grained token, this repo only, "Issues: Read and write"   (secret)
//   TURNSTILE_SECRET  optional, enables Cloudflare Turnstile bot checks              (secret)
//   FEED_AUTHOR       optional: the GitHub login that owns the token, if not the repo owner

const MAX_CODE = 20000;
const MAX_CAPTION = 140;
const LIMIT = { posts: 5, likes: 60, windowMs: 10 * 60 * 1000 }; // per visitor, best effort (per Worker instance)
const recent = new Map();
const recentLikes = new Map();
const likedBy = new Map(); // visitor+post → time, so one visitor can't like the same post over and over
const LIKES_RE = /<!-- linework-likes:(\d+) -->/;
const GH = 'https://api.github.com';

// Forgiving about stray spaces, a trailing slash, letter case, or a pasted path.
const normOrigin = (s) => {
  const t = String(s || '').trim().replace(/^['"]|['"]$/g, '');
  try { return new URL(t).origin.toLowerCase(); } catch { return t.replace(/\/+$/, '').toLowerCase(); }
};
const allowedOrigins = (env) => String(env.ALLOWED_ORIGIN || '').split(',').map(normOrigin).filter(Boolean);
const isAllowed = (env, origin) => allowedOrigins(env).includes(normOrigin(origin));

function cors(env, origin) {
  return {
    'Access-Control-Allow-Origin': isAllowed(env, origin) ? origin : (allowedOrigins(env)[0] || 'null'),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function reply(env, origin, status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(env, origin) } });
}

// Structural check of a chess game code (js/chess.js: two bytes per move, optional end marker).
// Whether the moves are legal is checked by the feed builder, which replays every game.
function validGame(code) {
  if (typeof code !== 'string' || code.length > 2000 || !/^LWC1\.[A-Za-z0-9_-]+$/.test(code)) return false;
  let bin;
  try { bin = atob(code.slice(5).replace(/-/g, '+').replace(/_/g, '/')); } catch { return false; }
  if (bin.length < 2 || bin.length % 2) return false;
  for (let i = 0; i < bin.length; i += 2) {
    const v = (bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1);
    const end = v >= 0xfff0 && v <= 0xfff2;
    if (end && i !== bin.length - 2) return false;
    if (!end && ((v & 7) > 4 || v > 0x7fff)) return false;
  }
  return true;
}

// Structural check of a drawing code (same format as js/share.js), without drawing it.
function validCode(code) {
  if (typeof code === 'string' && code.startsWith('LWC1.')) return validGame(code);
  if (typeof code !== 'string' || code.length > MAX_CODE || !/^LW1\.[A-Za-z0-9_-]+$/.test(code)) return false;
  let bin;
  try { bin = atob(code.slice(4).replace(/-/g, '+').replace(/_/g, '/')); } catch { return false; }
  const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  let o = 0;
  if (b.length < 3 || b[o++] !== 1) return false;
  const n = (b[o++] << 8) | b[o++];
  if (n < 1 || n > 300) return false;
  for (let k = 0; k < n; k++) {
    if (o + 5 > b.length || b[o] > 2) return false;
    const m = (b[o + 3] << 8) | b[o + 4];
    o += 5;
    if (m < 1 || o + m * 3 > b.length) return false;
    o += m * 3;
  }
  return o === b.length;
}

function cleanCaption(text) {
  const s = String(text || '')
    .replace(/[\u0000-\u001f\u007f<>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CAPTION);
  if (/https?:|www\.|\.(com|net|org|ru|xyz|io)\b/i.test(s)) return null; // no links
  return s;
}

const b64url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function rateLimited(key, map = recent, max = LIMIT.posts) {
  const now = Date.now();
  const list = (map.get(key) || []).filter((t) => now - t < LIMIT.windowMs);
  if (list.length >= max) { map.set(key, list); return true; }
  list.push(now);
  map.set(key, list);
  if (map.size > 5000) map.clear();
  return false;
}

function gh(env, path, init = {}) {
  return fetch(`${GH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'linework-relay',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

const feedAuthor = (env) => String(env.FEED_AUTHOR || env.GITHUB_REPO.split('/')[0]).toLowerCase();
const likesIn = (body) => Number((body || '').match(LIKES_RE)?.[1] || 0);

// Like counts for every open post, from one or a few GitHub calls, cached briefly.
async function likeCounts(env, ctx) {
  const cache = caches.default;
  const key = new Request(`https://linework-relay.cache/likes/${env.GITHUB_REPO}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const likes = {};
  for (let page = 1; page <= 5; page++) {
    const res = await gh(env, `/repos/${env.GITHUB_REPO}/issues?state=open&creator=${encodeURIComponent(feedAuthor(env))}&per_page=100&page=${page}`);
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const batch = await res.json();
    for (const i of batch) if ((i.body || '').includes('<!-- linework-post -->')) likes[i.number] = likesIn(i.body);
    if (batch.length < 100) break;
  }
  const out = { likes };
  const put = cache.put(key, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'max-age=20' } }));
  if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  return out;
}

async function forgetCachedCounts(env) {
  try { await caches.default.delete(new Request(`https://linework-relay.cache/likes/${env.GITHUB_REPO}`)); } catch { /* ignore */ }
}

async function like(env, n, undo) {
  const res = await gh(env, `/repos/${env.GITHUB_REPO}/issues/${n}`);
  if (res.status === 404) return { status: 404, body: { error: 'That post doesn’t exist.' } };
  if (!res.ok) return { status: 502, body: { error: 'Couldn’t reach GitHub. Try again later.' } };
  const issue = await res.json();
  const body = issue.body || '';
  if (issue.state !== 'open' || !body.includes('<!-- linework-post -->') || issue.user?.login?.toLowerCase() !== feedAuthor(env)) {
    return { status: 404, body: { error: 'That post isn’t in the feed.' } };
  }
  const likes = Math.max(0, likesIn(body) + (undo ? -1 : 1));
  const marker = `<!-- linework-likes:${likes} -->`;
  const next = LIKES_RE.test(body) ? body.replace(LIKES_RE, marker) : `${body}\n${marker}`;
  const upd = await gh(env, `/repos/${env.GITHUB_REPO}/issues/${n}`, { method: 'PATCH', body: JSON.stringify({ body: next }) });
  if (!upd.ok) return { status: 502, body: { error: 'Liking failed on GitHub’s side. Try again later.' } };
  await forgetCachedCounts(env);
  return { status: 200, body: { ok: true, likes } };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, origin) });

    // Like counts: readable by anyone (they're public anyway), cached for a few seconds.
    if (request.method === 'GET' && path === '/likes') {
      if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return reply(env, origin, 500, { error: 'The relay is not configured yet.' });
      try { return reply(env, origin, 200, await likeCounts(env, ctx)); }
      catch { return reply(env, origin, 502, { error: 'Couldn’t reach GitHub.' }); }
    }
    if (request.method !== 'POST') return reply(env, origin, 405, { error: 'Use POST.' });
    if (!isAllowed(env, origin)) {
      return reply(env, origin, 403, { error: `Posts are only accepted from the Linework site. This request came from “${origin || 'unknown'}”; set ALLOWED_ORIGIN on the Worker to exactly that.` });
    }
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return reply(env, origin, 500, { error: 'The relay is not configured yet.' });

    // Rate limit on a one-way hash of the address, kept only in memory.
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const key = btoa(String.fromCharCode(...new Uint8Array(digest).slice(0, 12)));
    let data;
    try { data = await request.json(); } catch { return reply(env, origin, 400, { error: 'Bad request.' }); }

    if (path === '/like') {
      const n = Number(data.n);
      if (!Number.isInteger(n) || n < 1) return reply(env, origin, 400, { error: 'Bad request.' });
      if (rateLimited(key, recentLikes, LIMIT.likes)) return reply(env, origin, 429, { error: 'Too many likes. Try again in a few minutes.' });
      // One like per post per visitor (best effort, in memory): repeats are ignored, an unlike clears it.
      const once = `${key}:${n}`;
      if (!data.undo && likedBy.has(once)) return reply(env, origin, 200, { ok: true, repeat: true });
      // Only the visitor who gave a like can take it back, so nobody can drag other people's counts down.
      if (data.undo && !likedBy.has(once)) return reply(env, origin, 200, { ok: true, ignored: true });
      const out = await like(env, n, !!data.undo);
      if (out.status === 200) {
        if (data.undo) likedBy.delete(once); else likedBy.set(once, Date.now());
        if (likedBy.size > 20000) likedBy.clear();
      }
      return reply(env, origin, out.status, out.body);
    }
    if (path !== '/' && path !== '/post') return reply(env, origin, 404, { error: 'Not found.' });
    if (rateLimited(key)) return reply(env, origin, 429, { error: 'Too many posts. Try again in a few minutes.' });
    if (!validCode(data.code)) return reply(env, origin, 400, { error: 'That drawing could not be read.' });
    const caption = cleanCaption(data.caption);
    if (caption === null) return reply(env, origin, 400, { error: 'Captions can’t include links.' });

    if (env.TURNSTILE_SECRET) {
      const form = new FormData();
      form.append('secret', env.TURNSTILE_SECRET);
      form.append('response', String(data.turnstile || ''));
      form.append('remoteip', ip);
      const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
      const result = await check.json().catch(() => ({}));
      if (!result.success) return reply(env, origin, 403, { error: 'The bot check failed. Please try again.' });
    }

    // The readable copy in the issue can't ping people or link other issues; the feed uses the encoded original.
    const shown = (caption || '').replace(/@/g, '@\u200b').replace(/#/g, '#\u200b');
    const body = [
      '<!-- linework-post -->',
      'Posted anonymously from Linework. Close this issue to remove the post from the feed.',
      '',
      shown ? `> ${shown}` : '',
      `<!-- linework-caption:${b64url(caption || '')} -->`,
      '',
      '```',
      data.code,
      '```',
    ].join('\n');

    const created = await gh(env, `/repos/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: `${data.code.startsWith('LWC1.') ? 'Chess game' : 'Drawing'}${shown ? `: ${shown.slice(0, 60)}` : ''}`, body: `${body}\n<!-- linework-likes:0 -->`, labels: ['linework-post'] }),
    });
    if (!created.ok) return reply(env, origin, 502, { error: 'Posting failed on GitHub’s side. Try again later.' });
    const issue = await created.json();
    return reply(env, origin, 201, { ok: true, number: issue.number });
  },
};
