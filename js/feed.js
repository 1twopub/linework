// Linework — the public feed. Reads feed.json (built by the GitHub Action from post issues).

import { decodeDrawing, drawingSvg } from './share.js';
import { POST_URL } from '../config.js';

const $ = (id) => document.getElementById(id);
const PAGE = 30;
const PENDING_KEY = 'linework.pending';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let posts = [];
let shown = 0;
const LIKED_KEY = 'linework.liked';
const relay = POST_URL ? (POST_URL.endsWith('/') ? POST_URL : `${POST_URL}/`) : '';
let liked = new Set();
try { liked = new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || '[]')); } catch { /* storage unavailable */ }
const saveLiked = () => { try { localStorage.setItem(LIKED_KEY, JSON.stringify([...liked].slice(-2000))); } catch { /* ignore */ } };

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.8 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.4 0 5.6 3.3 4.4 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"/></svg>';

function likeButton(p) {
  if (!relay || !p.n) return '';
  const on = liked.has(p.n);
  const count = Math.max(Number(p.likes) || 0, on ? 1 : 0);
  return `<button class="like${on ? ' on' : ''}" type="button" data-n="${p.n}" aria-pressed="${on}" aria-label="${on ? 'Unlike' : 'Like'} this drawing">
    ${HEART}<span class="like-count">${count || ''}</span></button>`;
}

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
      <div class="post-foot">
        <p class="post-time"><time datetime="${esc(p.at)}">${ago(p.at)}</time></p>
        ${likeButton(p)}
      </div>
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

  // Live like counts from the relay (feed.json's counts can be a few minutes old).
  if (relay) {
    try {
      const res = await fetch(`${relay}likes`, { cache: 'no-store' });
      if (res.ok) {
        const { likes } = await res.json();
        for (const p of posts) if (likes && likes[p.n] !== undefined) p.likes = likes[p.n];
      }
    } catch { /* show feed.json's counts */ }
  }
  if (!posts.length) { $('empty').hidden = false; return; }
  $('feedSub').textContent = `${published.length} drawing${published.length === 1 ? '' : 's'}, and the records their lines picked.`;
  renderMore();
})();

$('more').addEventListener('click', renderMore);

// Like / unlike. Shown straight away; put back if the relay says no.
$('feed').addEventListener('click', async (e) => {
  const btn = e.target.closest('.like');
  if (!btn || btn.disabled) return;
  const n = Number(btn.dataset.n);
  const post = posts.find((p) => p.n === n);
  const undo = liked.has(n);
  const before = Number(post?.likes) || 0;
  const paint = (on, count) => {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', `${on ? 'Unlike' : 'Like'} this drawing`);
    btn.querySelector('.like-count').textContent = count > 0 ? String(count) : '';
  };
  const after = Math.max(0, before + (undo ? -1 : 1));
  if (undo) liked.delete(n); else liked.add(n);
  if (post) post.likes = after;
  saveLiked();
  paint(!undo, after);
  if (!undo) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
  btn.disabled = true;
  try {
    const res = await fetch(`${relay}like`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ n, undo }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Like failed');
    if (data.repeat) { if (post) post.likes = before; paint(true, before); } // already counted earlier
    else if (typeof data.likes === 'number') { if (post) post.likes = data.likes; paint(!undo, data.likes); }
  } catch {
    if (undo) liked.add(n); else liked.delete(n);
    if (post) post.likes = before;
    saveLiked();
    paint(undo, before);
  } finally {
    btn.disabled = false;
  }
});
