import { analyze, DIMS, DIM_LABELS } from './analyze.js';
import { plan, searchUrl } from './mapping.js';
import * as spotify from './spotify.js';
import { matchRelease, loadCatalog } from './catalog.js';
import { MOTIF_LABELS } from './analyze.js';
import { encodeDrawing, decodeDrawing, drawingSvg } from './share.js';
import { loadNet } from './sketchnet.js';
import { POST_URL, TURNSTILE_SITEKEY } from '../config.js';

const $ = (id) => document.getElementById(id);
const els = {
  paper: $('paper'), canvas: $('canvas'), prompt: $('prompt'),
  undo: $('undoBtn'), clear: $('clearBtn'), submit: $('submitBtn'),
  drawScreen: $('drawScreen'), resultScreen: $('resultScreen'),
  thumb: $('thumb'), motif: $('motif'), traits: $('traits'), meters: $('meters'),
  mapping: $('mapping'), release: $('release'), again: $('againBtn'),
  settings: $('settings'), settingsBtn: $('settingsBtn'), clientId: $('clientIdInput'),
  redirect: $('redirectUri'), copy: $('copyRedirect'), authStatus: $('authStatus'), logout: $('logoutBtn'),
};

const INK = '#141311';
const ctx = els.canvas.getContext('2d');
let strokes = [];
let current = null;
let activePointer = null;
let penSize = 0.013;
let cssSize = 0;
let catalog = null; // set when catalog.json (or a builder preview) is available
const homePost = document.getElementById('homePostBtn');
let postedCode = null; // the last drawing posted from here, so it isn't posted twice
let lastPost = null; // the drawing + record on the result screen, ready to post
let preview = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Canvas ----------

function resize() {
  const rect = els.paper.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cssSize = rect.width;
  els.canvas.width = Math.round(rect.width * dpr);
  els.canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

function drawStroke(c, s, size) {
  const pts = s.points;
  if (!pts.length) return;
  c.strokeStyle = INK;
  c.fillStyle = INK;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(1, s.size * size);
  if (pts.length === 1) {
    c.beginPath();
    c.arc(pts[0].x * size, pts[0].y * size, c.lineWidth / 2, 0, Math.PI * 2);
    c.fill();
    return;
  }
  c.beginPath();
  c.moveTo(pts[0].x * size, pts[0].y * size);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    c.quadraticCurveTo(pts[i].x * size, pts[i].y * size, mx * size, my * size);
  }
  const last = pts[pts.length - 1];
  c.lineTo(last.x * size, last.y * size);
  c.stroke();
}

function redraw() {
  ctx.clearRect(0, 0, cssSize, cssSize);
  for (const s of strokes) drawStroke(ctx, s, cssSize);
  if (current) {
    drawStroke(ctx, current, cssSize);
    drawString(ctx, current, cssSize);
  }
}

// A faint thread from the pen tip to the finger, so the pen's trailing feels deliberate.
function drawString(c, s, size) {
  const a = s.points[s.points.length - 1], b = s.reach;
  if (!b || Math.hypot(b.x - a.x, b.y - a.y) < 0.004) return;
  c.save();
  c.strokeStyle = 'rgba(20, 19, 17, 0.22)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(a.x * size, a.y * size);
  c.lineTo(b.x * size, b.y * size);
  c.stroke();
  c.beginPath();
  c.arc(b.x * size, b.y * size, 3, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

function syncButtons() {
  const has = strokes.length > 0;
  els.undo.disabled = !has;
  els.clear.disabled = !has;
  els.submit.disabled = !has;
  homePost.disabled = !has || homePost.dataset.busy === '1';
  els.paper.classList.toggle('inked', has || !!current);
}

function pointFrom(e) {
  const r = els.canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    t: e.timeStamp || performance.now(),
  };
}

// ---------- Steady pen ----------
// The pen trails the finger on a short invisible string: it only moves once the finger is
// further away than the string's length, then follows at that distance. Small wobbles are
// absorbed, so lines feel heavier and steadier. Fingers get the longest string.
const STRING = { touch: 0.016, pen: 0.006, mouse: 0.004 };
let stringLen = STRING.touch;
let pen = null; // where the pen tip is, while the finger moves

function follow(p) {
  const dx = p.x - pen.x, dy = p.y - pen.y;
  const d = Math.hypot(dx, dy);
  if (d <= stringLen) return false;
  const k = (d - stringLen) / d;
  pen = { x: pen.x + dx * k, y: pen.y + dy * k, t: p.t };
  return true;
}

function addPoint(p) {
  const last = current.points[current.points.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) > 0.0015) current.points.push(p);
}

els.canvas.addEventListener('pointerdown', (e) => {
  if (activePointer !== null) return; // one finger draws; others are ignored
  if (e.button !== undefined && e.button > 0) return;
  e.preventDefault();
  activePointer = e.pointerId;
  try { els.canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  stringLen = STRING[e.pointerType] ?? STRING.touch;
  pen = pointFrom(e);
  current = { size: penSize, points: [pen], reach: pen };
  syncButtons();
  redraw();
});

els.canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activePointer || !current) return;
  e.preventDefault();
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (events.length ? events : [e])) {
    const p = pointFrom(ev);
    current.reach = p;
    if (follow(p)) addPoint(pen);
  }
  redraw();
  scheduleLive();
});

function endStroke(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  if (current) {
    // Let the pen catch up, so the line ends where the finger lifted.
    const end = current.reach;
    const last = current.points[current.points.length - 1];
    const gap = Math.hypot(end.x - last.x, end.y - last.y);
    if (current.points.length > 1 ? gap > 0.0015 : gap > 0.006) {
      const n = Math.ceil(gap / 0.004);
      for (let i = 1; i <= n; i++) addPoint({ x: last.x + (end.x - last.x) * i / n, y: last.y + (end.y - last.y) * i / n, t: end.t });
    }
    delete current.reach;
    strokes.push(current);
  }
  current = null;
  pen = null;
  syncButtons();
  redraw();
  updateLive(true);
}
els.canvas.addEventListener('pointerup', endStroke);
els.canvas.addEventListener('pointercancel', endStroke);
els.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.querySelectorAll('.nib').forEach((b) => {
  b.addEventListener('click', () => {
    penSize = Number(b.dataset.size);
    document.querySelectorAll('.nib').forEach((n) => n.setAttribute('aria-checked', String(n === b)));
  });
});
els.undo.addEventListener('click', () => { strokes.pop(); syncButtons(); redraw(); updateLive(true); });
els.clear.addEventListener('click', () => { strokes = []; syncButtons(); redraw(); updateLive(true); });

new ResizeObserver(resize).observe(els.paper);

function snapshot(px = 288) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, px, px);
  for (const s of strokes) drawStroke(x, s, px);
  return c.toDataURL('image/png');
}

// ---------- Result ----------

function show(screen) {
  els.drawScreen.hidden = screen !== 'draw';
  els.resultScreen.hidden = screen !== 'result';
  window.scrollTo({ top: 0 });
  if (screen === 'draw') requestAnimationFrame(resize);
}

function renderReading(a, p) {
  els.thumb.src = snapshot();
  els.motif.textContent = a.motifLabel;
  els.traits.textContent = a.traits.length ? a.traits.join(', ') : 'even-handed';
  els.meters.innerHTML = DIMS.map((d) => `<dt>${DIM_LABELS[d]}</dt><dd><i data-v="${a.features[d].toFixed(3)}"></i></dd>`).join('');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    els.meters.querySelectorAll('i').forEach((i) => { i.style.width = `${Math.max(2, Number(i.dataset.v) * 100)}%`; });
  }));
  if (catalog) {
    const src = catalog.source?.name ? ` from <b>${esc(catalog.source.name)}</b>` : '';
    els.mapping.innerHTML = `Matching against <b>${catalog.releases.length} records</b>${src}`;
    return;
  }
  els.mapping.innerHTML = `Searching for <b>“${esc(p.word)}”</b> in <b>${esc(p.genre)}</b>, <span style="white-space:nowrap">${esc(p.yearRange.replace('-', '–'))}</span>`;
}

function loadingHtml() {
  return '<div class="loading"><span class="pen-line"></span><p>Decyphering…</p></div>';
}

function noticeHtml({ message, action, actionId, link, error }) {
  return `<div class="notice">
    <p class="${error ? 'error' : ''}">${message}</p>
    ${action ? `<button class="submit" id="${actionId}">${esc(action)}</button>` : ''}
    ${link ? `<a class="submit ghost" href="${esc(link.href)}" target="_blank" rel="noopener">${esc(link.label)}</a>` : ''}
  </div>`;
}

function releaseHtml(r) {
  const t = r.kind || r.type;
  const kind = t === 'single' ? 'Single' : t === 'compilation' ? 'Compilation' : t ? 'Album' : '';
  return `<article class="card">
    <div class="card-head">
      ${r.image ? `<img class="cover" src="${esc(r.image)}" alt="Cover of ${esc(r.name)}">` : '<div class="cover"></div>'}
      <div>
        <p class="label">Your record</p>
        <h3>${esc(r.name)}</h3>
        <p class="artist">${esc(r.artists)}</p>
        <p class="meta">${[kind, r.year].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
    </div>
    <iframe class="embed" title="Spotify player for ${esc(r.name)}" src="https://open.spotify.com/embed/album/${encodeURIComponent(r.id)}?utm_source=generator"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
    <p class="why">${r.whyHtml}</p>
    <a class="submit accent" href="${esc(r.url)}" target="_blank" rel="noopener">Open in Spotify</a>
    ${r.postable ? '<button class="submit ghost" id="postBtn" type="button">Post to the feed</button>' : ''}
  </article>`;
}

function catalogWhy(r, a) {
  const parts = [];
  const v = r.via;
  if (v) {
    const shape = (MOTIF_LABELS[v.motif] || v.motif).toLowerCase();
    const title = v.text === r.name ? 'The title' : `The track “${esc(v.text)}”`;
    if (v.kind === 'sound') parts.push(`Its ${esc(r.genre)} sound suits your drawing (${esc(shape)})`);
    else if (!v.text || v.text === 'added by hand') parts.push(`Tagged as ${esc(shape)}`);
    else if (v.kind === 'hint') parts.push(`${title} hints at your drawing (${esc(shape)})`);
    else parts.push(`${title} ${v.motif === a.motif ? 'echoes' : 'is close to'} your drawing (${esc(shape)})`);
  }
  if (r.genre && v?.kind !== 'sound') parts.push(`${parts.length ? 'and its' : 'Its'} ${esc(r.genre)} sound sits closest to how your lines move`);
  else if (r.genre) parts.push('and sits closest to how your lines move');
  else if (!parts.length) parts.push('Closest record to how your lines move');
  return `${parts.join(', ')}.`;
}

// The drawing exactly as it would be posted (packed and unpacked), so the live preview, the result
// and the feed always agree on the record.
function asStored(list) {
  const code = encodeDrawing(list);
  return { code, used: code ? decodeDrawing(code) : list };
}

// ---------- Live pairing while drawing ----------
// Matching runs in a background worker (js/live-worker.js) so the pen never stutters.
// Requests are coalesced: while one is being worked out, only the newest drawing waits.

const live = {
  el: $('live'), cover: $('liveCover'), motif: $('liveMotif'), title: $('liveTitle'), artist: $('liveArtist'),
  timer: null, id: null, motifKey: null, every: 120,
  worker: null, busy: false, queued: null, seq: 0, shownSeq: 0, generation: 0, pending: new Map(),
};

// The result's reading, worked out in the worker when there is one (the recognizer is warm there),
// otherwise here. Same code and same inputs either way.
async function analyzeDrawing(used) {
  if (live.worker) {
    const id = ++live.seq;
    const a = await new Promise((done) => {
      live.pending.set(id, done);
      live.worker.postMessage({ type: 'analyze', id, strokes: used.map((st) => ({ size: st.size, points: st.points.map((pt) => ({ x: pt.x, y: pt.y, t: pt.t })) })) });
      setTimeout(() => { if (live.pending.delete(id)) done(null); }, 6000);
    });
    if (a) return a;
  }
  return analyze(used, { net: net || await withNet(4000) });
}

function startLiveWorker() {
  if (!catalog || live.worker || typeof Worker === 'undefined') return;
  try {
    live.worker = new Worker(new URL('./live-worker.js', import.meta.url), { type: 'module' });
    live.worker.postMessage({ type: 'catalog', catalog });
    live.worker.onmessage = (e) => {
      const m = e.data;
      if (m?.type === 'analysis') { const done = live.pending.get(m.id); live.pending.delete(m.id); done?.(m.error ? null : m.analysis); return; }
      live.busy = false;
      if (m && m.type === 'match' && !m.error && m.id > live.shownSeq) showLive(m);
      if (live.queued) { const q = live.queued; live.queued = null; sendLive(q); }
    };
    live.worker.onerror = () => { live.worker = null; live.busy = false; for (const done of live.pending.values()) done(null); live.pending.clear(); };
  } catch { live.worker = null; }
}

function sendLive(list) {
  const id = ++live.seq;
  if (live.worker) {
    if (live.busy) { live.queued = list; return; }
    live.busy = true;
    live.worker.postMessage({ type: 'match', id, strokes: list });
    return;
  }
  // No worker support: work it out here instead.
  if (!net) withNet(0);
  const a = analyze(asStored(list).used, { net });
  const r = matchRelease(a, catalog);
  showLive({ id, motif: a.motif, motifLabel: a.motifLabel, release: r });
}

function showLive(m) {
  if (!strokes.length && !current) return; // cleared meanwhile
  live.shownSeq = m.id;
  const r = m.release;
  if (!r) return;
  live.el.hidden = false;
  if (m.motif !== live.motifKey) {
    live.motif.textContent = m.motifLabel;
    live.motifKey = m.motif;
  }
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

function updateLive(final = false) {
  clearTimeout(live.timer);
  live.timer = null;
  if (!catalog) return;
  startLiveWorker();
  const list = !final && current && current.points.length > 1 ? [...strokes, current] : strokes;
  if (!list.length) {
    live.el.hidden = true;
    live.id = null;
    live.motifKey = null;
    live.queued = null;
    live.shownSeq = live.seq; // ignore anything still on its way
    return;
  }
  // Copy just what the analysis needs, so the worker gets a clean snapshot.
  sendLive(list.map((st) => ({ size: st.size, points: st.points.map((pt) => ({ x: pt.x, y: pt.y, t: pt.t })) })));
}

function scheduleLive() {
  if (!catalog || live.timer) return;
  live.timer = setTimeout(() => { live.timer = null; updateLive(false); }, live.every);
}

live.el.addEventListener('click', () => { if (strokes.length) submit(); });

async function submit() {
  if (!strokes.length) return;
  // In catalog mode the drawing is matched exactly as it will be stored, so a post
  // shows the same record the person saw here (the feed recomputes it from the stored code).
  let code = null;
  let used = strokes;
  if (catalog) ({ code, used } = asStored(strokes));
  if (catalog) startLiveWorker();
  const a = await analyzeDrawing(used);
  const p = plan(a);
  renderReading(a, p);
  show('result');

  if (catalog) {
    const r = matchRelease(a, catalog);
    const postable = !!(r && code && POST_URL && !preview && code !== postedCode);
    lastPost = postable ? { code, strokes: used, motif: a.motif, motifLabel: a.motifLabel, traits: a.traits, release: r } : null;
    els.release.innerHTML = r ? releaseHtml({ ...r, whyHtml: catalogWhy(r, a), postable }) : noticeHtml({ message: 'The catalog is empty.' });
    $('postBtn')?.addEventListener('click', openPost);
    return;
  }

  const search = { href: searchUrl(p), label: `Search Spotify for “${p.word} ${p.genre}”` };

  if (!spotify.getClientId()) {
    els.release.innerHTML = noticeHtml({
      message: 'Connect a Spotify app to get one specific release for this drawing.',
      action: 'Set up Spotify', actionId: 'setupBtn', link: search,
    });
    $('setupBtn').addEventListener('click', openSettings);
    return;
  }
  if (!spotify.isLoggedIn()) {
    els.release.innerHTML = noticeHtml({
      message: 'Log in with Spotify once to find your record. Your drawing waits here.',
      action: 'Log in with Spotify', actionId: 'loginBtn', link: search,
    });
    $('loginBtn').addEventListener('click', () => spotify.login({ strokes }));
    return;
  }

  els.release.innerHTML = loadingHtml();
  try {
    const r = await spotify.findRelease(p);
    if (r) r.whyHtml = r.viaTrack ? `Found through the track “${esc(r.viaTrack)}”, matched on ${esc(r.why)}.` : `Matched on ${esc(r.why)}.`;
    els.release.innerHTML = r
      ? releaseHtml(r)
      : noticeHtml({ message: 'Spotify came up empty for these lines. Try adding a few more strokes.', link: search });
  } catch (err) {
    if (err instanceof spotify.AuthError) {
      els.release.innerHTML = noticeHtml({ message: 'Your Spotify session ended. Log in again to continue.', action: 'Log in with Spotify', actionId: 'loginBtn' });
      $('loginBtn').addEventListener('click', () => spotify.login({ strokes }));
    } else {
      els.release.innerHTML = noticeHtml({ message: esc(err.message || 'Something went wrong.'), error: true, link: search });
    }
  }
}

els.submit.addEventListener('click', submit);
els.again.addEventListener('click', () => { strokes = []; syncButtons(); updateLive(true); show('draw'); });

// ---------- Settings ----------

function refreshSettings() {
  els.redirect.textContent = spotify.redirectUri();
  els.clientId.value = spotify.getClientId();
  const logged = spotify.isLoggedIn();
  els.logout.hidden = !logged;
  els.authStatus.textContent = !spotify.getClientId() ? '' : logged ? 'Logged in to Spotify.' : 'Not logged in yet. You’ll be asked when you submit a drawing.';
}
function openSettings() { refreshSettings(); els.settings.showModal(); }
els.settingsBtn.addEventListener('click', openSettings);
els.settings.addEventListener('click', (e) => { if (e.target === els.settings) els.settings.close(); });
els.settings.addEventListener('close', () => {
  if (els.settings.returnValue === 'save' && els.clientId.value.trim() !== spotify.getClientId()) {
    spotify.setClientId(els.clientId.value);
    if (!els.resultScreen.hidden) submit();
  }
  els.settings.returnValue = '';
});
els.logout.addEventListener('click', () => { spotify.logout(); refreshSettings(); });
els.copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(spotify.redirectUri()); els.copy.textContent = 'Copied'; }
  catch { els.copy.textContent = 'Select it'; }
  setTimeout(() => { els.copy.textContent = 'Copy'; }, 1600);
});

// ---------- Sketch recognizer ----------
// About 0.5 MB. In catalog mode it runs in the live worker; this copy is only loaded when there is
// no worker (or in Spotify mode). The result waits briefly for it, so a drawing reads the same
// here, in the live strip and in the feed.

let net = null;
let netReady = null;
function withNet(ms) {
  netReady ||= loadNet().then((n) => { net = n; }).catch(() => { netReady = null; });
  return Promise.race([netReady, new Promise((res) => setTimeout(res, ms))]).then(() => net);
}

// ---------- Boot ----------

(async function boot() {
  resize();
  syncButtons();

  // Catalog mode: a builder preview (index.html?preview), else catalog.json next to this page.
  preview = new URLSearchParams(location.search).has('preview');
  if (preview) {
    try { catalog = JSON.parse(localStorage.getItem('linework.draftCatalog') || 'null'); } catch { catalog = null; }
    if (!catalog?.releases?.length) catalog = null;
  }
  if (!catalog) catalog = await loadCatalog();
  if (!catalog || typeof Worker === 'undefined') withNet(0);
  if (catalog) {
    els.settingsBtn.hidden = true; // no Spotify login needed
    homePost.hidden = !POST_URL || preview;
    $('feedLink').hidden = preview;
    if (preview) {
      els.prompt.insertAdjacentHTML('beforebegin', `<p class="preview-banner">Preview: ${catalog.releases.length} records from your builder draft</p>`);
    }
    return;
  }

  let result = null;
  try { result = await spotify.handleRedirect(); }
  catch (err) { result = { error: `Spotify login failed: ${err.message}` }; }
  if (result?.pending?.strokes?.length) {
    strokes = result.pending.strokes;
    syncButtons();
    redraw();
  }
  if (result?.error) {
    els.prompt.textContent = result.error;
    els.prompt.classList.add('error');
  } else if (strokes.length) {
    submit();
  }
})();

// ---------- Posting to the feed ----------

const post = {
  sheet: $('postSheet'), body: $('postBody'), done: $('postDone'), caption: $('postCaption'),
  error: $('postError'), send: $('postSend'), box: $('turnstileBox'),
};
let turnstileToken = '';
let turnstileWidget = null;

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
  if (!lastPost) return;
  $('postDrawing').innerHTML = drawingSvg(lastPost.strokes, 120);
  $('postMotif').textContent = lastPost.motifLabel;
  $('postRecord').innerHTML = `<b>${esc(lastPost.release.name)}</b><br>${esc(lastPost.release.artists)}`;
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
  } else if (ts && turnstileWidget !== null) {
    ts.reset(turnstileWidget);
    turnstileToken = '';
  }
}

function rememberPending(entry) {
  try {
    const list = JSON.parse(localStorage.getItem('linework.pending') || '[]');
    list.unshift(entry);
    localStorage.setItem('linework.pending', JSON.stringify(list.slice(0, 20)));
  } catch { /* storage unavailable: the post still goes through */ }
}

post.send.addEventListener('click', async () => {
  if (!lastPost) return;
  if (TURNSTILE_SITEKEY && !turnstileToken) {
    post.error.textContent = 'Please complete the check above first.';
    post.error.hidden = false;
    return;
  }
  post.send.disabled = true;
  post.send.textContent = 'Posting…';
  post.error.hidden = true;
  const caption = post.caption.value.trim().slice(0, 140);
  try {
    const res = await fetch(POST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: lastPost.code, caption, turnstile: turnstileToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Posting failed (${res.status}).`);
    rememberPending({
      n: data.number, at: new Date().toISOString(), code: lastPost.code, caption,
      motif: lastPost.motif, motifLabel: lastPost.motifLabel, traits: lastPost.traits,
      release: (({ id, name, artists, year, image, url }) => ({ id, name, artists, year, image, url }))(lastPost.release),
      pending: true,
    });
    postedCode = lastPost.code;
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
// Post straight from the drawing screen: find the record the drawing pairs with, then open the sheet.
homePost.addEventListener('click', async () => {
  if (!strokes.length || !catalog || homePost.dataset.busy === '1') return;
  const { code, used } = asStored(strokes);
  if (!code) return;
  if (code === postedCode) {
    homePost.querySelector('span').textContent = 'Already posted';
    setTimeout(() => { homePost.querySelector('span').textContent = 'Post'; }, 1600);
    return;
  }
  homePost.dataset.busy = '1';
  homePost.disabled = true;
  try {
    startLiveWorker();
    const a = await analyzeDrawing(used);
    const r = matchRelease(a, catalog);
    if (!r) return;
    lastPost = { code, strokes: used, motif: a.motif, motifLabel: a.motifLabel, traits: a.traits, release: r };
    openPost();
  } finally {
    homePost.dataset.busy = '';
    syncButtons();
  }
});

$('postCancel').addEventListener('click', () => post.sheet.close());
$('postClose').addEventListener('click', () => post.sheet.close());
post.sheet.addEventListener('click', (e) => { if (e.target === post.sheet) post.sheet.close(); });
