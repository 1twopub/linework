// Linework relay — a Cloudflare Worker that turns anonymous posts into GitHub issues.
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

const MAX_CODE = 20000;
const MAX_CAPTION = 140;
const LIMIT = { posts: 5, windowMs: 10 * 60 * 1000 }; // per visitor, best effort (per Worker instance)
const recent = new Map();

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function reply(env, origin, status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(env, origin) } });
}

// Structural check of a drawing code (same format as js/share.js), without drawing it.
function validCode(code) {
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

function rateLimited(key) {
  const now = Date.now();
  const list = (recent.get(key) || []).filter((t) => now - t < LIMIT.windowMs);
  if (list.length >= LIMIT.posts) { recent.set(key, list); return true; }
  list.push(now);
  recent.set(key, list);
  if (recent.size > 5000) recent.clear();
  return false;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, origin) });
    if (request.method !== 'POST') return reply(env, origin, 405, { error: 'Use POST.' });
    if (!isAllowed(env, origin)) {
      return reply(env, origin, 403, { error: `Posts are only accepted from the Linework site. This request came from “${origin || 'unknown'}”; set ALLOWED_ORIGIN on the Worker to exactly that.` });
    }
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return reply(env, origin, 500, { error: 'The relay is not configured yet.' });

    // Rate limit on a one-way hash of the address, kept only in memory.
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const key = btoa(String.fromCharCode(...new Uint8Array(digest).slice(0, 12)));
    if (rateLimited(key)) return reply(env, origin, 429, { error: 'Too many posts. Try again in a few minutes.' });

    let data;
    try { data = await request.json(); } catch { return reply(env, origin, 400, { error: 'Bad request.' }); }
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

    const gh = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'linework-relay',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: `Drawing${shown ? `: ${shown.slice(0, 60)}` : ''}`, body, labels: ['linework-post'] }),
    });
    if (!gh.ok) return reply(env, origin, 502, { error: 'Posting failed on GitHub’s side. Try again later.' });
    const issue = await gh.json();
    return reply(env, origin, 201, { ok: true, number: issue.number });
  },
};
