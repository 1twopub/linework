// Linework — Spotify Web API access with the Authorization Code + PKCE flow.
// PKCE needs no client secret, so it runs entirely in the browser (and on GitHub Pages).

import { CLIENT_ID as CONFIG_CLIENT_ID } from '../config.js';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const KEY = {
  client: 'linework.clientId',
  token: 'linework.token',
  verifier: 'linework.verifier',
  state: 'linework.state',
  pending: 'linework.pending',
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

export function redirectUri() {
  // The page's own URL without query, hash or index.html. Register this exact value in the Spotify dashboard.
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

export function getClientId() {
  return (store.get(KEY.client) || CONFIG_CLIENT_ID || '').trim();
}

export function setClientId(id) {
  const clean = (id || '').trim();
  if (clean) store.set(KEY.client, clean);
  else store.del(KEY.client);
  store.del(KEY.token);
}

function readToken() {
  try { return JSON.parse(store.get(KEY.token) || 'null'); } catch { return null; }
}

function saveToken(data) {
  const prev = readToken();
  store.set(KEY.token, JSON.stringify({
    access: data.access_token,
    refresh: data.refresh_token || prev?.refresh || null,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  }));
}

export function isLoggedIn() {
  return !!readToken()?.access;
}

export function logout() {
  store.del(KEY.token);
}

function randomString(n = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Sends the person to Spotify to log in. `pending` is saved so the drawing survives the round trip.
export async function login(pending) {
  const clientId = getClientId();
  if (!clientId) throw new Error('Add a Spotify Client ID first.');
  const verifier = randomString(64);
  const state = randomString(16);
  store.set(KEY.verifier, verifier);
  store.set(KEY.state, state);
  if (pending) store.set(KEY.pending, JSON.stringify(pending));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    state,
    scope: '', // search needs no scopes
  });
  location.assign(`${AUTH_URL}?${params}`);
}

// Call once on page load. Finishes a login if Spotify just redirected back here.
// Returns { pending } (the saved drawing, if any) or null.
export async function handleRedirect() {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return null;

  history.replaceState(null, '', redirectUri() + url.hash);
  const pendingRaw = store.get(KEY.pending);
  store.del(KEY.pending);
  let pending = null;
  try { pending = JSON.parse(pendingRaw || 'null'); } catch { /* ignore */ }

  if (error) return { pending, error: error === 'access_denied' ? 'Spotify login was cancelled.' : `Spotify said: ${error}` };
  if (url.searchParams.get('state') !== store.get(KEY.state)) {
    return { pending, error: 'Login check failed (state mismatch). Try again.' };
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: store.get(KEY.verifier) || '',
    }),
  });
  store.del(KEY.verifier);
  store.del(KEY.state);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { pending, error: `Spotify login failed: ${body.error_description || res.status}` };
  }
  saveToken(await res.json());
  return { pending };
}

async function accessToken() {
  const t = readToken();
  if (!t?.access) return null;
  if (Date.now() < t.expires) return t.access;
  if (!t.refresh) { logout(); return null; }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: getClientId() }),
  });
  if (!res.ok) { logout(); return null; }
  saveToken(await res.json());
  return readToken().access;
}

export class AuthError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET from the Web API. Waits and retries when Spotify says to slow down (429 + Retry-After),
// as long as the wait is reasonable; `onWait(seconds)` lets the caller show that it's waiting.
export async function api(path, params = {}, { onWait } = {}) {
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken();
    if (!token) throw new AuthError('Not logged in to Spotify.');
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API}${path}${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { logout(); throw new AuthError('Spotify session expired.'); }
    if (res.status === 403) throw new Error('Spotify refused the request. In development mode your Spotify account must be added to the app’s user list, and the app owner needs Premium.');
    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After')) || 5;
      if (attempt >= 4 || wait > 120) throw new Error(`Spotify rate limit reached. Try again in ${Math.ceil(wait / 60)} min.`);
      onWait?.(wait);
      await sleep(wait * 1000 + 250);
      continue;
    }
    if (res.status === 404) { const e = new Error('Not found on Spotify.'); e.status = 404; throw e; }
    if (!res.ok) throw new Error(`Spotify error ${res.status}`);
    return res.json();
  }
}

// Accepts a playlist link, a spotify:playlist: URI, or a bare ID.
export function parsePlaylistId(input) {
  const s = String(input || '').trim();
  const m = s.match(/playlist[/:]([A-Za-z0-9]{22})/) || s.match(/^([A-Za-z0-9]{22})$/);
  return m ? m[1] : null;
}

// Normalizes a search hit (track or album) to a release.
function toRelease(item, type, attempt) {
  const album = type === 'track' ? item.album : item;
  if (!album?.id) return null;
  return {
    id: album.id,
    name: album.name,
    artists: (album.artists || []).map((a) => a.name).join(', '),
    year: (album.release_date || '').slice(0, 4),
    kind: album.album_type || 'album',
    image: album.images?.[0]?.url || '',
    url: album.external_urls?.spotify || `https://open.spotify.com/album/${album.id}`,
    viaTrack: type === 'track' ? item.name : null,
    query: attempt.q,
    why: attempt.why,
  };
}

// Runs the search plan, returning the chosen release.
// Development-mode apps get at most 10 results per request (Feb 2026 change), so `limit` stays at 10.
export async function findRelease(p) {
  for (const attempt of p.attempts) {
    const base = { q: attempt.q, type: attempt.type, limit: '10' };
    let data = await api('/search', { ...base, offset: '0' });
    let page = data[`${attempt.type}s`];
    let items = (page?.items || []).filter(Boolean);
    if (!items.length) continue;

    // Reach a little deeper into large result sets so similar drawings land on different records.
    const total = Math.min(page.total || items.length, 200);
    if (total > 10) {
      const offset = Math.floor(p.offsetSeed * Math.min(total - 1, 40) / 10) * 10;
      if (offset > 0) {
        data = await api('/search', { ...base, offset: String(offset) });
        const deeper = (data[`${attempt.type}s`]?.items || []).filter(Boolean);
        if (deeper.length) items = deeper;
      }
    }

    // Skip duplicate albums, then pick deterministically.
    const seen = new Set();
    const releases = [];
    for (const it of items) {
      const r = toRelease(it, attempt.type, attempt);
      if (r && !seen.has(r.id)) { seen.add(r.id); releases.push(r); }
    }
    if (releases.length) return releases[Math.floor(p.pick * releases.length)];
  }
  return null;
}
