// Linework — turns a drawing analysis into a Spotify search plan.
// The motif (what the drawing looks like) chooses the keywords.
// The linework (how it was drawn) chooses the genre and the era.

import { DIMS } from './analyze.js';
import { OBJECTS } from './objects.js';

// Keywords searched in track and album titles, one list per motif.
export const MOTIF_WORDS = {
  face: ['face', 'portrait', 'smile', 'mirror', 'stranger', 'lips'],
  sun: ['sun', 'sunshine', 'daylight', 'solar', 'summer', 'golden'],
  circle: ['circle', 'orbit', 'halo', 'round', 'eclipse', 'ring'],
  spiral: ['spiral', 'vertigo', 'dizzy', 'whirlpool', 'galaxy', 'hypnotic'],
  star: ['star', 'stars', 'starlight', 'constellation', 'supernova', 'comet'],
  grid: ['city', 'grid', 'window', 'blocks', 'system', 'pattern'],
  rain: ['rain', 'storm', 'downpour', 'drizzle', 'thunder', 'monsoon'],
  dots: ['dots', 'confetti', 'pixel', 'freckles', 'fireflies', 'static'],
  zigzag: ['electric', 'lightning', 'voltage', 'shock', 'spark', 'zigzag'],
  mountain: ['mountain', 'peak', 'summit', 'pyramid', 'altitude', 'cliff'],
  wave: ['wave', 'ocean', 'tide', 'surf', 'current', 'drift'],
  loops: ['loop', 'loops', 'tangled', 'knot', 'ribbon', 'swirl'],
  horizon: ['horizon', 'skyline', 'distance', 'shoreline', 'level', 'plains'],
  line: ['line', 'straight', 'path', 'road', 'one way', 'wire'],
  scribble: ['chaos', 'noise', 'scribble', 'mess', 'riot', 'frenzy'],
  heart: ['heart', 'love', 'lovers', 'valentine', 'kiss', 'sweetheart'],
  house: ['house', 'home', 'room', 'door', 'castle', 'roof'],
  flower: ['flower', 'rose', 'bloom', 'garden', 'blossom', 'daisy'],
  moon: ['moon', 'moonlight', 'lunar', 'crescent', 'midnight', 'night'],
  eye: ['eyes', 'vision', 'gaze', 'sight', 'watching', 'blind'],
  cross: ['cross', 'crossroads', 'church', 'prayer', 'holy', 'faith'],
  box: ['box', 'square', 'cube', 'cage', 'frame', 'prison'],
  arrow: ['arrow', 'direction', 'forward', 'target', 'compass', 'aim'],
  figure: ['man', 'woman', 'girl', 'boy', 'people', 'body'],
  bird: ['bird', 'wings', 'fly', 'feather', 'dove', 'raven'],
  cloud: ['cloud', 'clouds', 'fog', 'mist', 'haze', 'smoke'],
  crown: ['king', 'queen', 'crown', 'royal', 'throne', 'empire'],
  diamond: ['diamond', 'ice', 'jewel', 'crystal', 'gem', 'pearl'],
  drop: ['drip', 'drop', 'tears', 'drown', 'wet', 'sweat'],
  flame: ['fire', 'flame', 'burn', 'blaze', 'hot', 'lit'],
  money: ['money', 'cash', 'rich', 'bands', 'paid', 'dollar'],
  note: ['music', 'song', 'melody', 'sing', 'tune', 'anthem'],
  clock: ['time', 'clock', 'hour', 'minute', 'tonight', 'forever'],
  globe: ['world', 'earth', 'planet', 'globe', 'universe', 'nation'],
  skull: ['dead', 'death', 'skull', 'grave', 'ghost', 'bones'],
  car: ['car', 'ride', 'drive', 'whip', 'wheels', 'highway'],
  phone: ['phone', 'call', 'hotline', 'text', 'ring', 'dial'],
  screen: ['tv', 'screen', 'video', 'movie', 'film', 'camera'],
  bubble: ['talk', 'words', 'say', 'conversation', 'whisper', 'voices'],
  abstract: ['shape', 'form', 'abstract', 'gesture', 'figure', 'sketch'],
};
for (const [m, o] of Object.entries(OBJECTS)) MOTIF_WORDS[m] = o.words;

// Each genre has a linework profile (0..1 on every dimension; omitted dims are 0.5)
// and the span of years its records come from.
// Genre names are Spotify genre tags, used with the `genre:` search filter.
export const GENRES = [
  { g: 'ambient', p: { energy: 0.08, angularity: 0.1, curvature: 0.65, density: 0.15, chaos: 0.12, height: 0.6 }, y: [1978, 2026] },
  { g: 'dream pop', p: { energy: 0.25, angularity: 0.15, curvature: 0.85, density: 0.35, chaos: 0.3, height: 0.7 }, y: [1984, 2026] },
  { g: 'shoegaze', p: { energy: 0.45, angularity: 0.25, curvature: 0.7, density: 0.8, chaos: 0.6, height: 0.55 }, y: [1988, 2026] },
  { g: 'folk', p: { energy: 0.2, angularity: 0.3, curvature: 0.5, density: 0.3, chaos: 0.2, height: 0.35, symmetry: 0.6 }, y: [1960, 2026] },
  { g: 'singer-songwriter', p: { energy: 0.25, angularity: 0.35, curvature: 0.45, density: 0.25, chaos: 0.2, height: 0.5, symmetry: 0.65 }, y: [1966, 2026] },
  { g: 'jazz', p: { energy: 0.5, angularity: 0.4, curvature: 0.75, density: 0.45, chaos: 0.5, height: 0.55 }, y: [1955, 2026] },
  { g: 'soul', p: { energy: 0.45, angularity: 0.3, curvature: 0.7, density: 0.5, chaos: 0.3, height: 0.45, symmetry: 0.6 }, y: [1962, 2026] },
  { g: 'funk', p: { energy: 0.7, angularity: 0.55, curvature: 0.55, density: 0.55, chaos: 0.45, height: 0.35 }, y: [1967, 2026] },
  { g: 'disco', p: { energy: 0.7, angularity: 0.35, curvature: 0.6, density: 0.45, chaos: 0.25, height: 0.6, symmetry: 0.8 }, y: [1974, 2026] },
  { g: 'house', p: { energy: 0.7, angularity: 0.45, curvature: 0.3, density: 0.5, chaos: 0.2, height: 0.5, symmetry: 0.85 }, y: [1986, 2026] },
  { g: 'techno', p: { energy: 0.85, angularity: 0.75, curvature: 0.15, density: 0.65, chaos: 0.3, height: 0.4, symmetry: 0.85 }, y: [1988, 2026] },
  { g: 'drum and bass', p: { energy: 0.95, angularity: 0.7, curvature: 0.35, density: 0.6, chaos: 0.6, height: 0.5 }, y: [1993, 2026] },
  { g: 'synthpop', p: { energy: 0.55, angularity: 0.55, curvature: 0.25, density: 0.4, chaos: 0.2, height: 0.65, symmetry: 0.8 }, y: [1979, 2026] },
  { g: 'new wave', p: { energy: 0.6, angularity: 0.7, curvature: 0.25, density: 0.4, chaos: 0.35, height: 0.55 }, y: [1978, 1990] },
  { g: 'post-punk', p: { energy: 0.65, angularity: 0.8, curvature: 0.2, density: 0.45, chaos: 0.55, height: 0.35, symmetry: 0.3 }, y: [1978, 2026] },
  { g: 'punk', p: { energy: 0.95, angularity: 0.85, curvature: 0.15, density: 0.55, chaos: 0.8, height: 0.4, symmetry: 0.25 }, y: [1976, 2026] },
  { g: 'hardcore', p: { energy: 1, angularity: 0.9, curvature: 0.1, density: 0.85, chaos: 0.9, height: 0.3, symmetry: 0.2 }, y: [1980, 2026] },
  { g: 'noise', p: { energy: 0.8, angularity: 0.6, curvature: 0.4, density: 1, chaos: 1, symmetry: 0.15 }, y: [1980, 2026] },
  { g: 'industrial', p: { energy: 0.75, angularity: 0.95, curvature: 0.1, density: 0.75, chaos: 0.55, height: 0.25, symmetry: 0.6 }, y: [1978, 2026] },
  { g: 'metal', p: { energy: 0.9, angularity: 0.95, curvature: 0.15, density: 0.8, chaos: 0.6, height: 0.3 }, y: [1970, 2026] },
  { g: 'grunge', p: { energy: 0.7, angularity: 0.6, curvature: 0.35, density: 0.7, chaos: 0.7, height: 0.25, symmetry: 0.3 }, y: [1988, 2000] },
  { g: 'psychedelic rock', p: { energy: 0.55, angularity: 0.25, curvature: 0.95, density: 0.6, chaos: 0.6, height: 0.6 }, y: [1965, 2026] },
  { g: 'krautrock', p: { energy: 0.6, angularity: 0.35, curvature: 0.5, density: 0.4, chaos: 0.25, height: 0.45, symmetry: 0.9 }, y: [1969, 1980] },
  { g: 'minimal', p: { energy: 0.2, angularity: 0.45, curvature: 0.2, density: 0.05, chaos: 0.05, symmetry: 0.85 }, y: [1964, 2026] },
  { g: 'classical', p: { energy: 0.35, angularity: 0.3, curvature: 0.6, density: 0.4, chaos: 0.15, height: 0.65, symmetry: 0.9 }, y: [1950, 2026] },
  { g: 'hip hop', p: { energy: 0.65, angularity: 0.65, curvature: 0.3, density: 0.6, chaos: 0.4, height: 0.2, symmetry: 0.55 }, y: [1986, 2026] },
  { g: 'trip hop', p: { energy: 0.3, angularity: 0.35, curvature: 0.55, density: 0.55, chaos: 0.35, height: 0.25 }, y: [1993, 2026] },
  { g: 'lo-fi', p: { energy: 0.3, angularity: 0.45, curvature: 0.45, density: 0.3, chaos: 0.45, height: 0.35, symmetry: 0.35 }, y: [1995, 2026] },
  { g: 'reggae', p: { energy: 0.4, angularity: 0.3, curvature: 0.65, density: 0.35, chaos: 0.25, height: 0.3, symmetry: 0.7 }, y: [1968, 2026] },
  { g: 'bossa nova', p: { energy: 0.3, angularity: 0.15, curvature: 0.8, density: 0.25, chaos: 0.15, height: 0.5, symmetry: 0.7 }, y: [1958, 2026] },
  { g: 'blues', p: { energy: 0.35, angularity: 0.45, curvature: 0.5, density: 0.4, chaos: 0.35, height: 0.15, symmetry: 0.45 }, y: [1950, 2026] },
  { g: 'country', p: { energy: 0.4, angularity: 0.4, curvature: 0.4, density: 0.3, chaos: 0.2, height: 0.2, symmetry: 0.6 }, y: [1955, 2026] },
  { g: 'indie rock', p: { energy: 0.55, angularity: 0.5, curvature: 0.45, density: 0.45, chaos: 0.45, height: 0.5, symmetry: 0.45 }, y: [1990, 2026] },
  { g: 'experimental', p: { energy: 0.5, angularity: 0.5, curvature: 0.5, density: 0.5, chaos: 0.75, symmetry: 0.1 }, y: [1960, 2026] },
  { g: 'electronica', p: { energy: 0.55, angularity: 0.4, curvature: 0.55, density: 0.4, chaos: 0.3, height: 0.75, symmetry: 0.7 }, y: [1992, 2026] },
  { g: 'gospel', p: { energy: 0.55, angularity: 0.2, curvature: 0.6, density: 0.5, chaos: 0.2, height: 0.95, symmetry: 0.85 }, y: [1955, 2026] },
  // Finer splits for rap and its neighbours.
  { g: 'trap', p: { energy: 0.75, angularity: 0.7, curvature: 0.3, density: 0.7, chaos: 0.45, height: 0.25, symmetry: 0.6 }, y: [2005, 2026] },
  { g: 'cloud rap', p: { energy: 0.35, angularity: 0.25, curvature: 0.75, density: 0.3, chaos: 0.45, height: 0.85, symmetry: 0.4 }, y: [2010, 2026] },
  { g: 'drill', p: { energy: 0.7, angularity: 0.9, curvature: 0.15, density: 0.65, chaos: 0.5, height: 0.15, symmetry: 0.5 }, y: [2012, 2026] },
  { g: 'grime', p: { energy: 0.95, angularity: 0.8, curvature: 0.2, density: 0.5, chaos: 0.7, height: 0.45, symmetry: 0.35 }, y: [2002, 2026] },
  { g: 'r&b', p: { energy: 0.3, angularity: 0.15, curvature: 0.85, density: 0.4, chaos: 0.15, height: 0.6, symmetry: 0.75 }, y: [1988, 2026] },
  { g: 'dancehall', p: { energy: 0.75, angularity: 0.5, curvature: 0.5, density: 0.45, chaos: 0.45, height: 0.4, symmetry: 0.7 }, y: [1980, 2026] },
  { g: 'latin', p: { energy: 0.7, angularity: 0.35, curvature: 0.7, density: 0.55, chaos: 0.35, height: 0.5, symmetry: 0.75 }, y: [1960, 2026] },
  // Stand-up and comic records: bouncy, loose, all over the page.
  { g: 'comedy', p: { energy: 0.55, angularity: 0.45, curvature: 0.6, density: 0.3, chaos: 0.8, height: 0.6, symmetry: 0.2 }, y: [1955, 2026] },
];

// Small seeded random generator, so the same drawing always maps to the same release.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distance(f, p) {
  let s = 0;
  for (const d of DIMS) s += ((f[d] ?? 0.5) - (p[d] ?? 0.5)) ** 2;
  return Math.sqrt(s);
}

export function rankGenres(features) {
  return GENRES
    .map((x) => ({ ...x, dist: distance(features, x.p) }))
    .sort((a, b) => a.dist - b.dist);
}

// Builds an ordered list of searches, most specific first.
// The app tries each until one returns results.
export function plan(analysis) {
  const rand = rng(analysis.hash || 1);
  const ranked = rankGenres(analysis.features);

  // Weighted pick among the three closest genres, favouring the closest.
  const top = ranked.slice(0, 3);
  const weights = top.map((g) => 1 / (0.05 + g.dist) ** 2);
  let r = rand() * weights.reduce((s, w) => s + w, 0);
  let genre = top[0];
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) { genre = top[i]; break; }
  }

  // Decade: neat, symmetric drawings lean older; chaotic, dense ones lean newer.
  const [y0, y1] = genre.y;
  const lean = 0.5 + 0.35 * (analysis.features.chaos - analysis.features.symmetry) + (rand() - 0.5) * 0.4;
  const year = Math.round(y0 + Math.min(1, Math.max(0, lean)) * (y1 - y0));
  const decade = Math.max(y0, Math.floor(year / 10) * 10);
  const yearRange = `${decade}-${Math.min(y1, decade + 9)}`;

  const words = MOTIF_WORDS[analysis.motif] || MOTIF_WORDS.abstract;
  const start = Math.floor(rand() * words.length);
  const word = words[start];
  const alt = words[(start + 1) % words.length];
  const q = (w) => (w.includes(' ') ? `"${w}"` : w);
  const gq = `genre:"${genre.g}"`;

  const attempts = [
    { type: 'track', q: `${q(word)} ${gq} year:${yearRange}`, why: 'title, genre and era' },
    { type: 'track', q: `${q(word)} ${gq}`, why: 'title and genre' },
    { type: 'track', q: `${q(alt)} ${gq}`, why: 'title and genre' },
    { type: 'album', q: `${q(word)} year:${yearRange}`, why: 'album title and era' },
    { type: 'track', q: `${gq} year:${yearRange}`, why: 'genre and era' },
    { type: 'album', q: q(word), why: 'album title' },
  ];

  return {
    genre: genre.g,
    genreRanking: ranked.slice(0, 5).map((g) => g.g),
    word,
    yearRange,
    attempts,
    pick: rand(), // used to choose among the results
    offsetSeed: rand(),
  };
}

// Link that works with no login, for demo mode.
export function searchUrl(planObj) {
  return `https://open.spotify.com/search/${encodeURIComponent(`${planObj.word} ${planObj.genre}`)}`;
}
