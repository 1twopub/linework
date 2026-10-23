import { analyze, DIMS, DIM_LABELS } from './analyze.js';
import { plan, searchUrl } from './mapping.js';
import * as spotify from './spotify.js';
import { matchRelease, loadCatalog } from './catalog.js';
import { MOTIF_LABELS } from './analyze.js';

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
  if (current) drawStroke(ctx, current, cssSize);
}

function syncButtons() {
  const has = strokes.length > 0;
  els.undo.disabled = !has;
  els.clear.disabled = !has;
  els.submit.disabled = !has;
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

els.canvas.addEventListener('pointerdown', (e) => {
  if (activePointer !== null) return; // one finger draws; others are ignored
  if (e.button !== undefined && e.button > 0) return;
  e.preventDefault();
  activePointer = e.pointerId;
  els.canvas.setPointerCapture(e.pointerId);
  current = { size: penSize, points: [pointFrom(e)] };
  syncButtons();
  redraw();
});

els.canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activePointer || !current) return;
  e.preventDefault();
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (events.length ? events : [e])) {
    const p = pointFrom(ev);
    const last = current.points[current.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 0.0015) current.points.push(p);
  }
  redraw();
});

function endStroke(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  if (current) strokes.push(current);
  current = null;
  syncButtons();
  redraw();
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
els.undo.addEventListener('click', () => { strokes.pop(); syncButtons(); redraw(); });
els.clear.addEventListener('click', () => { strokes = []; syncButtons(); redraw(); });

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
  return '<div class="loading"><span class="pen-line"></span><p>Flipping through the crates…</p></div>';
}

function noticeHtml({ message, action, actionId, link, error }) {
  return `<div class="notice">
    <p class="${error ? 'error' : ''}">${message}</p>
    ${action ? `<button class="submit" id="${actionId}">${esc(action)}</button>` : ''}
    ${link ? `<a class="submit ghost" href="${esc(link.href)}" target="_blank" rel="noopener">${esc(link.label)}</a>` : ''}
  </div>`;
}

function releaseHtml(r) {
  const kind = (r.kind || r.type) === 'single' ? 'Single' : (r.kind || r.type) === 'compilation' ? 'Compilation' : 'Album';
  return `<article class="card">
    <div class="card-head">
      ${r.image ? `<img class="cover" src="${esc(r.image)}" alt="Cover of ${esc(r.name)}">` : '<div class="cover"></div>'}
      <div>
        <p class="label">Your record</p>
        <h3>${esc(r.name)}</h3>
        <p class="artist">${esc(r.artists)}</p>
        <p class="meta">${esc(kind)}${r.year ? ` · ${esc(r.year)}` : ''}</p>
      </div>
    </div>
    <iframe class="embed" title="Spotify player for ${esc(r.name)}" src="https://open.spotify.com/embed/album/${encodeURIComponent(r.id)}?utm_source=generator"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
    <p class="why">${r.whyHtml}</p>
    <a class="submit accent" href="${esc(r.url)}" target="_blank" rel="noopener">Open in Spotify</a>
  </article>`;
}

function catalogWhy(r, a) {
  const parts = [];
  if (r.via) {
    const shape = (MOTIF_LABELS[r.via.motif] || r.via.motif).toLowerCase();
    parts.push(r.via.text && r.via.text !== 'added by hand'
      ? `“${esc(r.via.text)}” ${r.via.motif === a.motif ? 'echoes' : 'is close to'} your drawing (${esc(shape)})`
      : `Tagged as ${esc(shape)}`);
  }
  if (r.genre) parts.push(`${parts.length ? 'and its' : 'Its'} ${esc(r.genre)} sound sits closest to how your lines move`);
  else if (!parts.length) parts.push('Closest record to how your lines move');
  return `${parts.join(', ')}.`;
}

async function submit() {
  if (!strokes.length) return;
  const a = analyze(strokes);
  const p = plan(a);
  renderReading(a, p);
  show('result');

  if (catalog) {
    const r = matchRelease(a, catalog);
    els.release.innerHTML = r ? releaseHtml({ ...r, whyHtml: catalogWhy(r, a) }) : noticeHtml({ message: 'The catalog is empty.' });
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
els.again.addEventListener('click', () => { strokes = []; syncButtons(); show('draw'); });

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

// ---------- Boot ----------

(async function boot() {
  resize();
  syncButtons();

  // Catalog mode: a builder preview (index.html?preview), else catalog.json next to this page.
  const preview = new URLSearchParams(location.search).has('preview');
  if (preview) {
    try { catalog = JSON.parse(localStorage.getItem('linework.draftCatalog') || 'null'); } catch { catalog = null; }
    if (!catalog?.releases?.length) catalog = null;
  }
  if (!catalog) catalog = await loadCatalog();
  if (catalog) {
    els.settingsBtn.hidden = true; // no Spotify login needed
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
