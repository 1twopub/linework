// Linework — the public feed. Reads feed.json (built by the GitHub Action from post issues).

import { decodeDrawing, drawingSvg } from './share.js';
import { POST_URL } from '../config.js';

const $ = (id) => document.getElementById(id);
const PAGE = 24; // posts per page (feed.json, then feed/2.json, feed/3.json, …)
const PENDING_KEY = 'linework.pending';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let posts = [];
let shown = 0;
let pagesLoaded = 1;
let pagesTotal = 1;
let liveLikes = null; // like counts from the relay, once they arrive
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

// Drawings are drawn only as they come near the screen, and as images (painted once)
// rather than live vector shapes, so long feeds stay smooth.
const drawn = new WeakSet();
function drawArt(el) {
  if (drawn.has(el)) return;
  drawn.add(el);
  let svg = '';
  try { svg = drawingSvg(decodeDrawing(el.dataset.code), 300); } catch { return; }
  const img = new Image();
  img.decoding = 'async';
  img.alt = '';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  el.append(img);
  el.removeAttribute('data-code');
}
const artObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { artObserver.unobserve(e.target); drawArt(e.target); }
  }, { rootMargin: '600px 0px' })
  : null;

function card(p) {
  if (!/^LW1\.[A-Za-z0-9_-]+$/.test(p.code || '')) return '';
  const r = p.release || {};
  const safeUrl = /^https:\/\/open\.spotify\.com\//.test(r.url || '') ? r.url : `https://open.spotify.com/album/${encodeURIComponent(r.id || '')}`;
  const img = /^https:\/\/i\.scdn\.co\//.test(r.image || '') ? r.image : '';
  return `<li class="post${p.pending ? ' pending' : ''}">
    <div class="post-art" role="img" data-code="${esc(p.code)}" aria-label="Drawing read as ${esc((p.motifLabel || '').toLowerCase())}"></div>
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

function render(list) {
  const feed = $('feed');
  const before = feed.children.length;
  feed.insertAdjacentHTML('beforeend', list.map(card).join(''));
  for (const li of [...feed.children].slice(before)) {
    const art = li.querySelector('.post-art[data-code]');
    if (art) { if (artObserver) artObserver.observe(art); else drawArt(art); }
  }
}

async function renderMore() {
  const more = $('more');
  // Older posts live in their own files; fetch the next one when the ones in hand run out.
  if (shown >= posts.length && pagesLoaded < pagesTotal) {
    more.disabled = true;
    more.textContent = 'Loading…';
    try {
      const res = await fetch(`feed/${pagesLoaded + 1}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(String(res.status));
      const page = await res.json();
      const have = new Set(posts.map((p) => p.n));
      const fresh = (page.posts || []).filter((p) => !have.has(p.n));
      if (liveLikes) for (const p of fresh) if (liveLikes[p.n] !== undefined) p.likes = liveLikes[p.n];
      posts.push(...fresh);
      pagesLoaded++;
    } catch {
      more.disabled = false;
      more.textContent = 'Couldn’t load more. Try again';
      return;
    }
    more.disabled = false;
    more.textContent = 'Show more';
  }
  const next = posts.slice(shown, shown + PAGE);
  render(next);
  shown += next.length;
  more.hidden = shown >= posts.length && pagesLoaded >= pagesTotal;
}

function applyLikes(likes) {
  liveLikes = likes;
  for (const p of posts) if (likes[p.n] !== undefined) p.likes = likes[p.n];
  for (const btn of document.querySelectorAll('.like')) {
    const n = Number(btn.dataset.n);
    if (likes[n] === undefined || btn.disabled) continue;
    const count = Math.max(Number(likes[n]) || 0, liked.has(n) ? 1 : 0);
    btn.querySelector('.like-count').textContent = count > 0 ? String(count) : '';
  }
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
  pagesTotal = Math.max(1, Number(feed.pages) || 1);
  posts = [...pendingNotIn(published), ...published];

  // Live like counts from the relay (feed.json's counts can be a few minutes old).
  // Fetched alongside, never waited for: the drawings show first, the counts update when they arrive.
  if (relay) {
    fetch(`${relay}likes`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.likes) applyLikes(data.likes); })
      .catch(() => { /* keep feed.json's counts */ });
  }
  if (!posts.length) { $('empty').hidden = false; return; }
  const total = Number(feed.count) || published.length;
  $('feedSub').textContent = `${total} drawing${total === 1 ? '' : 's'}, and the records their lines picked.`;
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
