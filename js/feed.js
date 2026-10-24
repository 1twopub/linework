// Linework — the public feed. Reads feed.json (built by the GitHub Action from post issues).

import { decodeDrawing, drawingSvg } from './share.js';

const $ = (id) => document.getElementById(id);
const PAGE = 30;
const PENDING_KEY = 'linework.pending';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let posts = [];
let shown = 0;

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function card(p) {
  let svg = '';
  try { svg = drawingSvg(decodeDrawing(p.code), 300); } catch { return ''; }
  const r = p.release || {};
  const safeUrl = /^https:\/\/open\.spotify\.com\//.test(r.url || '') ? r.url : `https://open.spotify.com/album/${encodeURIComponent(r.id || '')}`;
  const img = /^https:\/\/i\.scdn\.co\//.test(r.image || '') ? r.image : '';
  return `<li class="post${p.pending ? ' pending' : ''}">
    <div class="post-art" role="img" aria-label="Drawing read as ${esc((p.motifLabel || '').toLowerCase())}">${svg}</div>
    <div class="post-info">
      <p class="label">${esc(p.motifLabel)}${p.pending ? ' · <span class="badge">Publishing…</span>' : ''}</p>
      ${p.caption ? `<p class="post-caption">${esc(p.caption)}</p>` : ''}
      <a class="post-rec" href="${esc(safeUrl)}" target="_blank" rel="noopener">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="noimg"></span>'}
        <span><b>${esc(r.name)}</b><br>${esc(r.artists)}${r.year ? ` · ${esc(r.year)}` : ''}</span>
      </a>
      <p class="post-time"><time datetime="${esc(p.at)}">${ago(p.at)}</time></p>
    </div>
  </li>`;
}

function renderMore() {
  const next = posts.slice(shown, shown + PAGE);
  $('feed').insertAdjacentHTML('beforeend', next.map(card).join(''));
  shown += next.length;
  $('more').hidden = shown >= posts.length;
}

// Your own recent posts show immediately, until the rebuilt feed includes them.
function pendingNotIn(feedPosts) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch { return []; }
  const published = new Set(feedPosts.map((p) => p.n));
  const fresh = list.filter((p) => !published.has(p.n) && Date.now() - new Date(p.at).getTime() < 30 * 60 * 1000);
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(fresh)); } catch { /* ignore */ }
  return fresh.map((p) => ({ ...p, pending: true }));
}

(async function boot() {
  let feed = { posts: [] };
  try {
    const res = await fetch('feed.json', { cache: 'no-cache' });
    if (res.ok) feed = await res.json();
  } catch { /* offline or not built yet */ }
  const published = Array.isArray(feed.posts) ? feed.posts : [];
  posts = [...pendingNotIn(published), ...published];
  if (!posts.length) { $('empty').hidden = false; return; }
  $('feedSub').textContent = `${published.length} drawing${published.length === 1 ? '' : 's'}, and the records their lines picked.`;
  renderMore();
})();

$('more').addEventListener('click', renderMore);
