// Linework — curated catalog: tagging releases, and matching drawings to them.
// The catalog lives in catalog.json at the site root. build.html creates it from a Spotify playlist.

import { DIMS, MOTIF_LABELS } from './analyze.js';
import { GENRES, rng } from './mapping.js';

export const MOTIFS = Object.keys(MOTIF_LABELS);

// Words in titles that suggest each motif. Matched as whole words, case-insensitive.
export const MOTIF_PATTERNS = {
  face: ['face[sd]?', 'portraits?', 'smil(e|es|ing)', 'eyes?', 'lips', 'mouth', 'mirror', 'strangers?', 'self', 'head'],
  sun: ['sun(s|ny|shine|set|sets|rise|light|day|burn|beam|flower)?', 'solar', 'summer(time)?', 'golden', 'daylight', 'dawn', 'heat'],
  circle: ['circles?', 'moon(s|light|lit)?', 'orbit(s|al)?', 'halo', 'round', 'eclipse', 'ring(s)?', 'zero', 'wheel(s)?', 'loop'],
  spiral: ['spiral(s|ing)?', 'vertigo', 'dizzy', 'whirl(pool|wind)?', 'galax(y|ies)', 'hypnoti[cz]e?', 'vortex', 'swirl', 'tornado', 'cyclone'],
  star: ['stars?', 'starlight', 'starry', 'constellations?', 'supernova', 'comets?', 'cosmic', 'shine', 'twinkle', 'astral'],
  grid: ['city', 'cities', 'grids?', 'windows?', 'blocks?', 'systems?', 'patterns?', 'streets?', 'metropolis', 'building(s)?', 'architecture'],
  rain: ['rain(s|y|ing|drops?|fall)?', 'storms?', 'stormy', 'downpour', 'drizzle', 'thunder(storm)?', 'monsoon', 'tears', 'weep(ing)?', 'cry(ing)?'],
  dots: ['dots?', 'confetti', 'pixels?', 'freckles', 'fireflies', 'static', 'snow(fall|flakes?)?', 'dust', 'stardust', 'sparkles?', 'bubbles'],
  zigzag: ['electric(ity)?', 'lightning', 'voltage', 'shocks?', 'sparks?', 'zig ?zag', 'bolt', 'thunderbolt', 'power', 'energy'],
  mountain: ['mountains?', 'peaks?', 'summit', 'pyramids?', 'altitude', 'cliffs?', 'hills?', 'high(er|est)?', 'climb(ing)?', 'volcano'],
  wave: ['waves?', 'ocean(s)?', 'sea', 'tides?', 'surf(ing)?', 'current(s)?', 'drift(ing)?', 'water', 'river(s)?', 'flow(ing)?'],
  loops: ['loops?', 'tangled?', 'knots?', 'ribbons?', 'swirls?', 'twist(ed)?', 'circus', 'roller ?coaster', 'curls?', 'lasso'],
  horizon: ['horizons?', 'skylines?', 'distance', 'shore(line)?', 'plains?', 'desert', 'landscape', 'fields?', 'prairie', 'flat(land)?', 'sky'],
  line: ['lines?', 'straight', 'arrows?', 'directions?', 'paths?', 'roads?', 'highway', 'one way', 'rails?', 'wire'],
  scribble: ['chaos', 'chaotic', 'noise', 'scribble', 'mess(y)?', 'riot', 'frenzy', 'madness', 'crazy', 'wild', 'havoc'],
  abstract: ['shapes?', 'forms?', 'abstract(ion)?', 'gestures?', 'figures?', 'sketch(es)?', 'drawings?', 'lines and', 'colou?rs?', 'art'],
};

const MOTIF_RE = Object.fromEntries(
  Object.entries(MOTIF_PATTERNS).map(([m, words]) => [m, new RegExp(`\\b(${words.join('|')})\\b`, 'i')]),
);

// Drawings that look alike share some credit.
export const RELATED = {
  face: ['circle', 'sun'], sun: ['circle', 'star', 'face'], circle: ['sun', 'spiral', 'face', 'loops'],
  spiral: ['loops', 'circle', 'wave'], star: ['sun', 'zigzag', 'dots'], grid: ['line', 'horizon'],
  rain: ['line', 'dots', 'wave'], dots: ['rain', 'star', 'scribble'], zigzag: ['mountain', 'star', 'scribble'],
  mountain: ['zigzag', 'horizon'], wave: ['horizon', 'loops', 'rain'], loops: ['spiral', 'scribble', 'wave'],
  horizon: ['line', 'wave', 'mountain'], line: ['horizon', 'grid', 'rain'], scribble: ['loops', 'zigzag', 'abstract'],
  abstract: ['scribble'],
};

// Spotify artist genre text → Linework genre. Order matters: more specific first.
const GENRE_RULES = [
  [/drum and bass|drum & bass|\bdnb\b|jungle|liquid funk/, 'drum and bass'],
  [/trip hop|trip-hop/, 'trip hop'],
  [/dream pop|ethereal/, 'dream pop'],
  [/shoegaze|nu gaze/, 'shoegaze'],
  [/post-punk|post punk|darkwave|coldwave|gothic rock|no wave/, 'post-punk'],
  [/hardcore|grindcore|screamo|powerviolence/, 'hardcore'],
  [/punk/, 'punk'],
  [/metal|doom|sludge|djent|thrash/, 'metal'],
  [/grunge/, 'grunge'],
  [/industrial|\bebm\b/, 'industrial'],
  [/noise/, 'noise'],
  [/techno/, 'techno'],
  [/house|uk garage|speed garage/, 'house'],
  [/disco/, 'disco'],
  [/synthpop|synth-pop|synthwave|electropop|electroclash/, 'synthpop'],
  [/new wave/, 'new wave'],
  [/krautrock|kosmische|motorik/, 'krautrock'],
  [/psych/, 'psychedelic rock'],
  [/ambient|drone|new age|space music/, 'ambient'],
  [/minimalism|minimal/, 'minimal'],
  [/classical|baroque|orchestra|opera|chamber|compositional|romantic era|piano/, 'classical'],
  [/jazz|bebop|swing|big band/, 'jazz'],
  [/gospel|worship|christian/, 'gospel'],
  [/funk/, 'funk'],
  [/soul|r&b|rnb|motown/, 'soul'],
  [/reggae|dub|ska|rocksteady|dancehall/, 'reggae'],
  [/bossa|samba|\bmpb\b|tropicalia|brazil/, 'bossa nova'],
  [/blues/, 'blues'],
  [/country|americana|bluegrass|honky/, 'country'],
  [/hip hop|hip-hop|\brap\b|trap|drill|grime|boom bap/, 'hip hop'],
  [/lo-fi|lofi|bedroom/, 'lo-fi'],
  [/singer-songwriter/, 'singer-songwriter'],
  [/folk/, 'folk'],
  [/\bidm\b|electronica|downtempo|glitch|chillwave|leftfield/, 'electronica'],
  [/experimental|avant|free improvisation|musique concrete/, 'experimental'],
  [/indie|alternative|rock|britpop|pop/, 'indie rock'],
];

export function genreFromArtistGenres(list) {
  const votes = new Map();
  for (const raw of list || []) {
    const g = String(raw).toLowerCase();
    const idx = GENRE_RULES.findIndex(([re]) => re.test(g));
    if (idx >= 0) votes.set(idx, (votes.get(idx) || 0) + 1);
  }
  if (!votes.size) return null;
  // Most votes wins; ties go to the more specific rule.
  const [idx] = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return GENRE_RULES[idx][1];
}

// Finds motifs in titles. `texts` is [{ text, weight }]. Returns { motif: matchedTitle }, strongest first.
export function motifsFromText(texts) {
  const scores = {};
  const where = {};
  for (const { text, weight } of texts) {
    if (!text) continue;
    for (const [m, re] of Object.entries(MOTIF_RE)) {
      if (re.test(text)) {
        scores[m] = (scores[m] || 0) + weight;
        if (!where[m] || weight > where[m].weight) where[m] = { text, weight };
      }
    }
  }
  return Object.fromEntries(
    Object.keys(scores).sort((a, b) => scores[b] - scores[a]).slice(0, 4).map((m) => [m, where[m].text]),
  );
}

function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// A release's place in linework space: its genre's profile, nudged a little so records in one genre don't tie.
// Releases with no known genre sit near the middle and are matched mostly by motif.
export function profileFor(genre, id) {
  const base = GENRES.find((g) => g.g === genre)?.p || {};
  const rand = rng(hashString(id || genre || 'x'));
  const spread = genre ? 0.06 : 0.18;
  const p = {};
  for (const d of DIMS) {
    const v = (base[d] ?? 0.5) + (rand() - 0.5) * 2 * spread;
    p[d] = Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  }
  return p;
}

function distance(f, p) {
  let s = 0;
  for (const d of DIMS) s += ((f[d] ?? 0.5) - (p?.[d] ?? 0.5)) ** 2;
  return Math.sqrt(s);
}

// Picks the release for a drawing. Same drawing, same release.
export function matchRelease(analysis, catalog) {
  const releases = catalog?.releases || [];
  if (!releases.length) return null;
  const motif = analysis.motif;
  const related = RELATED[motif] || [];

  const scored = releases.map((r) => {
    const motifs = r.motifs || {};
    let motifScore = 0;
    let via = null;
    if (motifs[motif] !== undefined) { motifScore = 1.4; via = { motif, text: motifs[motif] }; }
    else {
      const rel = related.find((m) => motifs[m] !== undefined);
      if (rel) { motifScore = 0.45; via = { motif: rel, text: motifs[rel] }; }
    }
    const dist = distance(analysis.features, r.profile);
    return { r, via, dist, score: motifScore - dist };
  }).sort((a, b) => b.score - a.score);

  // Weighted pick among the closest few, so near-identical drawings can still land on different records.
  const top = scored.slice(0, Math.min(6, scored.length));
  const rand = rng(analysis.hash || 1);
  const weights = top.map((s) => Math.exp((s.score - top[0].score) * 6));
  let x = rand() * weights.reduce((a, b) => a + b, 0);
  let pick = top[0];
  for (let i = 0; i < top.length; i++) { x -= weights[i]; if (x <= 0) { pick = top[i]; break; } }

  return { ...pick.r, via: pick.via, dist: pick.dist };
}

export async function loadCatalog(url = 'catalog.json') {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.releases) && data.releases.length ? data : null;
  } catch {
    return null;
  }
}
