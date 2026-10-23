// Linework — catalog builder. Reads a Spotify playlist, adds MusicBrainz genre tags, and writes catalog.json.

import * as spotify from './spotify.js';
import { GENRES } from './mapping.js';
import { MOTIF_LABELS } from './analyze.js';
import { MOTIFS, genreFromArtistGenres, motifsFromText, profileFor, loadCatalog } from './catalog.js';
import * as mb from './musicbrainz.js';

const $ = (id) => document.getElementById(id);
const DRAFT_KEY = 'linework.draftCatalog';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GENRE_NAMES = GENRES.map((g) => g.g).sort();

let catalog = null;
let filter = 'all';

// ---------- Draft storage ----------

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(catalog)); } catch { /* too big or blocked */ }
}
function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
}

// ---------- Connect ----------

function refreshAuth() {
  $('redirectUri').textContent = spotify.redirectUri();
  $('clientId').value = spotify.getClientId();
  const logged = spotify.isLoggedIn();
  $('logoutBtn').hidden = !logged;
  $('loginBtn').hidden = logged;
  $('authStatus').textContent = logged ? 'Logged in.' : '';
  $('buildBtn').disabled = !logged;
}

$('clientId').addEventListener('change', (e) => { spotify.setClientId(e.target.value); refreshAuth(); });
$('loginBtn').addEventListener('click', async () => {
  spotify.setClientId($('clientId').value);
  if (!spotify.getClientId()) { $('authStatus').textContent = 'Paste your Client ID first.'; return; }
  await spotify.login({ playlist: $('playlistInput').value });
});
$('logoutBtn').addEventListener('click', () => { spotify.logout(); refreshAuth(); });
$('copyRedirect').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(spotify.redirectUri()); $('copyRedirect').textContent = 'Copied'; }
  catch { $('copyRedirect').textContent = 'Select it'; }
  setTimeout(() => { $('copyRedirect').textContent = 'Copy'; }, 1600);
});

// ---------- Build ----------

function progress(done, total, text) {
  $('progress').hidden = false;
  $('progressBar').style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  $('progressText').textContent = text;
}

function pickImage(images) {
  if (!images?.length) return '';
  const sorted = [...images].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (sorted.find((im) => (im.width || 0) >= 280) || sorted[sorted.length - 1]).url;
}

function duration(sec) {
  if (sec < 60) return `${Math.max(1, Math.round(sec))}s`;
  return `${Math.round(sec / 60)} min`;
}

async function build() {
  const id = spotify.parsePlaylistId($('playlistInput').value);
  $('buildError').hidden = true;
  $('buildNote').hidden = true;
  if (!id) { showError('That doesn’t look like a Spotify playlist link.'); return; }
  $('buildBtn').disabled = true;
  const onWait = (s) => progress(0, 1, `Spotify asked us to slow down. Waiting ${duration(s)}…`);

  try {
    // 1. Read the playlist from Spotify. This is the only Spotify step: one call for the name,
    //    then one call per 50 tracks. Each track already carries its album's title, artists, cover and date.
    progress(0, 1, 'Reading the playlist from Spotify…');
    const meta = await spotify.api(`/playlists/${id}`, {}, { onWait });
    const owner = meta.owner?.display_name ? ` (owner: ${meta.owner.display_name})` : '';
    const notYours = `Spotify won’t share the tracks of “${meta.name}”${owner}. This app can only read playlists you own or collaborate on. Copy its tracks into a playlist of yours and use that link.`;

    const entries = [];
    const total = meta.items?.total ?? meta.tracks?.total ?? 0;
    for (let offset = 0; offset < 10000;) {
      let page;
      try {
        page = await spotify.api(`/playlists/${id}/items`, { limit: '50', offset: String(offset) }, { onWait });
      } catch (err) {
        if (err.status === 404 || /refused/.test(err.message)) throw new Error(notYours);
        throw err;
      }
      const items = page.items || [];
      entries.push(...items);
      progress(entries.length, total || entries.length, `Read ${entries.length}${total ? ` of ${total}` : ''} tracks…`);
      if (!page.next || !items.length) break;
      offset += items.length;
    }
    if (!entries.length) throw new Error(total ? notYours : 'This playlist has no tracks.');

    // 2. Group tracks by album.
    const albums = new Map();
    for (const e of entries) {
      const t = e.item || e.track;
      if (!t || t.type !== 'track' || t.is_local || !t.album?.id) continue;
      if (!albums.has(t.album.id)) albums.set(t.album.id, { album: t.album, picked: [] });
      albums.get(t.album.id).picked.push(t.name);
    }
    if (!albums.size) throw new Error('No Spotify tracks found (local files and podcasts are skipped).');
    const list = [...albums.values()];

    // 3. Genre tags from MusicBrainz, one lookup per artist (cached, so rebuilds are quick).
    const artists = new Map(); // normalized name -> { name, albumName }
    for (const a of list) {
      const name = a.album.artists?.[0]?.name;
      const key = mb.normalize(name);
      if (key && !artists.has(key)) artists.set(key, { name, albumName: a.album.name });
    }
    const queue = [...artists.values()];
    const tagsByArtist = new Map();
    let mbFailed = false;
    let done = 0;
    for (const art of queue) {
      const left = queue.slice(done).filter((x) => !mb.isCached(x.name)).length;
      progress(done, queue.length, `Genres from MusicBrainz: ${done} of ${queue.length} artists${left > 1 ? ` · about ${duration(left * 1.2)} left` : ''}…`);
      try {
        tagsByArtist.set(mb.normalize(art.name), await mb.artistTags(art.name, art.albumName));
      } catch (err) {
        if (err instanceof mb.MBUnreachable) { mbFailed = true; break; }
        throw err;
      }
      done++;
    }

    // 4. Tag each release.
    const previous = new Map(($('keepEdits').checked ? catalog?.releases || [] : []).map((r) => [r.id, r]));
    const releases = [];
    for (const { album: al, picked } of list) {
      const tags = tagsByArtist.get(mb.normalize(al.artists?.[0]?.name))?.tags || [];
      const genre = genreFromArtistGenres(tags);
      const motifs = motifsFromText([
        { text: al.name, weight: 3 },
        ...picked.map((text) => ({ text, weight: 2 })),
      ]);
      const rec = {
        id: al.id,
        name: al.name,
        artists: (al.artists || []).map((x) => x.name).join(', '),
        year: (al.release_date || '').slice(0, 4),
        type: al.album_type || 'album',
        image: pickImage(al.images),
        url: al.external_urls?.spotify || `https://open.spotify.com/album/${al.id}`,
        tags: tags.slice(0, 6).map((t) => t.name),
        genre,
        motifs,
        profile: profileFor(genre, al.id),
        edited: false,
      };
      const prev = previous.get(rec.id);
      if (prev?.edited) Object.assign(rec, { genre: prev.genre, motifs: prev.motifs, profile: prev.profile, edited: true });
      releases.push(rec);
    }

    catalog = {
      version: 2,
      source: { type: 'spotify-playlist', id, name: meta.name, url: meta.external_urls?.spotify || `https://open.spotify.com/playlist/${id}` },
      genres: 'musicbrainz',
      built: new Date().toISOString(),
      releases,
    };
    saveDraft();
    progress(1, 1, `Done: ${releases.length} records from “${meta.name}”.`);
    if (mbFailed) {
      showNote(`MusicBrainz couldn’t be reached, so ${done ? 'some records have' : 'records have'} no genre yet. Build again later to fill them in (finished lookups are remembered), or set genres by hand with the “Needs genre” filter.`);
    }
    render();
    $('reviewPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    if (err instanceof spotify.AuthError) refreshAuth();
    showError(err.message || String(err));
    $('progress').hidden = true;
  } finally {
    $('buildBtn').disabled = !spotify.isLoggedIn();
  }
}

function showNote(msg) {
  $('buildNote').textContent = msg;
  $('buildNote').hidden = false;
}

function showError(msg) {
  $('buildError').textContent = msg;
  $('buildError').hidden = false;
}

$('buildBtn').addEventListener('click', build);

// ---------- Review ----------

function render() {
  const has = !!catalog?.releases?.length;
  $('reviewPanel').hidden = !has;
  $('exportPanel').hidden = !has;
  if (!has) return;
  const rs = catalog.releases;

  const noGenre = rs.filter((r) => !r.genre).length;
  const noMotif = rs.filter((r) => !Object.keys(r.motifs || {}).length).length;
  $('stats').innerHTML = `
    <div><b>${rs.length}</b><span>records</span></div>
    <div><b>${rs.length - noGenre}</b><span>with a genre</span></div>
    <div><b>${rs.length - noMotif}</b><span>with a motif</span></div>`;

  const counts = Object.fromEntries(MOTIFS.map((m) => [m, 0]));
  for (const r of rs) for (const m of Object.keys(r.motifs || {})) counts[m]++;
  $('coverage').innerHTML = `<p class="label">Motif coverage</p><div class="chips">${
    MOTIFS.map((m) => `<span class="tag ${counts[m] ? '' : 'empty'}">${esc(m)} <b>${counts[m]}</b></span>`).join('')
  }</div><p class="small muted">Motifs at 0 still work: those drawings are matched on linework alone.</p>`;

  document.querySelectorAll('.filters .chip').forEach((c) => c.classList.toggle('on', c.dataset.filter === filter));
  const shown = rs.filter((r) => filter === 'all'
    || (filter === 'nogenre' && !r.genre)
    || (filter === 'nomotif' && !Object.keys(r.motifs || {}).length));

  const genreOptions = (sel) => `<option value="">unknown</option>${GENRE_NAMES.map((g) => `<option${g === sel ? ' selected' : ''}>${esc(g)}</option>`).join('')}`;
  $('records').innerHTML = shown.map((r) => {
    const motifs = Object.entries(r.motifs || {});
    const unused = MOTIFS.filter((m) => !(m in (r.motifs || {})));
    return `<li class="rec" data-id="${esc(r.id)}">
      ${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : '<div class="noimg"></div>'}
      <div class="rec-body">
        <p class="rec-title"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></p>
        <p class="rec-meta">${esc(r.artists)}${r.year ? ` · ${esc(r.year)}` : ''}${r.edited ? ' · <em>edited</em>' : ''}</p>
        ${(r.tags || r.artistGenres)?.length ? `<p class="rec-genres" title="${r.tags ? 'MusicBrainz tags for the artist' : 'Spotify’s genres for the artist'}">${esc((r.tags || r.artistGenres).slice(0, 4).join(', '))}</p>` : ''}
        <div class="rec-edit">
          <select class="genre" aria-label="Genre for ${esc(r.name)}">${genreOptions(r.genre)}</select>
          ${motifs.map(([m, why]) => `<button class="tag on" data-remove="${esc(m)}" title="From “${esc(why)}”. Tap to remove.">${esc(m)} ×</button>`).join('')}
          <select class="addmotif" aria-label="Add a motif"><option value="">+ motif</option>${unused.map((m) => `<option value="${m}">${esc(MOTIF_LABELS[m])}</option>`).join('')}</select>
        </div>
      </div>
    </li>`;
  }).join('') || '<li class="small muted">Nothing here.</li>';
}

function findRec(el) {
  const id = el.closest('.rec')?.dataset.id;
  return catalog.releases.find((r) => r.id === id);
}

$('records').addEventListener('change', (e) => {
  const rec = findRec(e.target);
  if (!rec) return;
  if (e.target.classList.contains('genre')) {
    rec.genre = e.target.value || null;
    rec.profile = profileFor(rec.genre, rec.id);
  } else if (e.target.classList.contains('addmotif') && e.target.value) {
    rec.motifs = { ...(rec.motifs || {}), [e.target.value]: 'added by hand' };
  } else return;
  rec.edited = true;
  saveDraft();
  render();
});
$('records').addEventListener('click', (e) => {
  const m = e.target.dataset?.remove;
  if (!m) return;
  const rec = findRec(e.target);
  if (!rec) return;
  const { [m]: _, ...rest } = rec.motifs || {};
  rec.motifs = rest;
  rec.edited = true;
  saveDraft();
  render();
});
document.querySelectorAll('.filters .chip').forEach((c) => c.addEventListener('click', () => { filter = c.dataset.filter; render(); }));

// ---------- Export ----------

function json() {
  return JSON.stringify(catalog, null, 1);
}
$('downloadBtn').addEventListener('click', () => {
  const blob = new Blob([json()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'catalog.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('copyJson').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(json()); $('copyJson').textContent = 'Copied'; }
  catch { $('copyJson').textContent = 'Couldn’t copy'; }
  setTimeout(() => { $('copyJson').textContent = 'Copy JSON'; }, 1600);
});

// ---------- Boot ----------

(async function boot() {
  let redirect = null;
  try { redirect = await spotify.handleRedirect(); } catch (err) { redirect = { error: err.message }; }
  if (redirect?.pending?.playlist) $('playlistInput').value = redirect.pending.playlist;
  refreshAuth();
  if (redirect?.error) $('authStatus').textContent = redirect.error;

  // Start from the draft in this browser, else the published catalog.json.
  catalog = loadDraft() || await loadCatalog();
  if (catalog?.source?.url && !$('playlistInput').value) $('playlistInput').value = catalog.source.url;
  render();
})();
