// Linework — genre tags from MusicBrainz (https://musicbrainz.org), a free, open music database.
// No key or login. MusicBrainz asks for at most ~1 request per second per IP, so requests are
// queued one at a time, and every answer is cached in this browser so rebuilds don't repeat work.

const MB = 'https://musicbrainz.org/ws/2';
const CACHE_KEY = 'linework.mbCache.v1';
const GAP_MS = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class MBUnreachable extends Error {}

let lastRequest = 0;
let cache = null;

function loadCache() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { cache = {}; }
  return cache;
}
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
}
export function clearCache() {
  cache = {};
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

// Lowercase, no accents, no "the", letters and digits only, so "The Beatles" = "beatles" = "BEATLES".
export function normalize(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

// Lucene query escaping for a quoted phrase.
const phrase = (s) => `"${String(s).replace(/[\\"]/g, '\\$&')}"`;

async function get(path, params) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastRequest + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();

    let res;
    try {
      // A plain GET with no custom headers, so the browser sends it without a CORS preflight.
      res = await fetch(`${MB}${path}?${new URLSearchParams({ ...params, fmt: 'json' })}`);
    } catch {
      if (attempt < 1) { await sleep(2000); continue; }
      throw new MBUnreachable('MusicBrainz could not be reached.');
    }
    if (res.status === 503 || res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`MusicBrainz error ${res.status}`);
    return res.json();
  }
  throw new Error('MusicBrainz is busy right now. Try building again in a few minutes.');
}

function mergeTags(...lists) {
  const counts = new Map();
  for (const list of lists) {
    for (const t of list || []) {
      const name = String(t.name || '').toLowerCase().trim();
      if (!name) continue;
      counts.set(name, Math.max(counts.get(name) || 0, Number(t.count) || 1));
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));
}

function bestArtist(results, name) {
  const target = normalize(name);
  const exact = results.filter((a) => normalize(a.name) === target
    || (a.aliases || []).some((al) => normalize(al.name) === target));
  if (exact.length) return exact.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const top = results[0];
  return top && (top.score || 0) >= 95 ? top : null;
}

// Tags for one artist, matched by name. Returns { mbid, tags: [{ name, count }] }, or { mbid: null, tags: [] }.
// `albumName` is used as a fallback: if the artist has no tags, the album's own tags are tried.
export async function artistTags(name, albumName) {
  const key = normalize(name);
  const store = loadCache();
  if (!key || key === 'variousartists') return { mbid: null, tags: [] };
  if (store[key]) return store[key];

  const found = await get('/artist', { query: `artist:${phrase(name)}`, limit: '5' });
  const artist = bestArtist(found?.artists || [], name);
  let tags = mergeTags(artist?.genres, artist?.tags);

  // Search results don't always carry tags; a direct lookup does.
  if (artist && !tags.length) {
    const full = await get(`/artist/${artist.id}`, { inc: 'genres tags' });
    tags = mergeTags(full?.genres, full?.tags);
  }
  // Still nothing: try the album itself.
  if (!tags.length && albumName) {
    const rg = await get('/release-group', {
      query: `releasegroup:${phrase(albumName)} AND artist:${phrase(name)}`,
      limit: '3',
    });
    const hit = (rg?.['release-groups'] || []).find((g) => (g.score || 0) >= 90);
    tags = mergeTags(hit?.genres, hit?.tags);
  }

  const result = { mbid: artist?.id || null, tags };
  store[key] = result;
  saveCache();
  return result;
}

export function isCached(name) {
  const key = normalize(name);
  return !key || key === 'variousartists' || !!loadCache()[key];
}
