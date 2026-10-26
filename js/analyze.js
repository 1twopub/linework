// Linework — drawing analysis.
// Everything works on normalized coordinates (0..1 on both axes, y grows downward).
// A stroke is { size, points: [{x, y, t}] } where t is a timestamp in ms.

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

const PASSES = 6;

export const DIMS = ['energy', 'angularity', 'curvature', 'density', 'chaos', 'height', 'symmetry'];

export const TRAIT_WORDS = {
  energy: ['unhurried', 'frenetic'],
  angularity: ['soft-edged', 'jagged'],
  curvature: ['straight-laced', 'flowing'],
  density: ['sparse', 'dense'],
  chaos: ['orderly', 'chaotic'],
  height: ['grounded', 'airy'],
  symmetry: ['lopsided', 'balanced'],
};

export const DIM_LABELS = {
  energy: 'Speed',
  angularity: 'Angles',
  curvature: 'Curves',
  density: 'Ink',
  chaos: 'Chaos',
  height: 'Lift',
  symmetry: 'Symmetry',
};

export const MOTIF_LABELS = {
  face: 'A face',
  sun: 'A sun',
  circle: 'A circle',
  spiral: 'A spiral',
  star: 'A star',
  grid: 'A grid',
  rain: 'Rainfall',
  dots: 'A field of dots',
  zigzag: 'A zigzag',
  mountain: 'A peak',
  wave: 'A wave',
  loops: 'Loops',
  horizon: 'A horizon',
  line: 'A single line',
  scribble: 'A scribble',
  heart: 'A heart',
  house: 'A house',
  flower: 'A flower',
  moon: 'A crescent moon',
  eye: 'An eye',
  cross: 'A cross',
  box: 'A box',
  arrow: 'An arrow',
  figure: 'A figure',
  bird: 'A bird',
  cloud: 'A cloud',
  crown: 'A crown',
  diamond: 'A diamond',
  drop: 'A drop',
  flame: 'A flame',
  money: 'A dollar sign',
  note: 'A music note',
  clock: 'A clock',
  globe: 'A globe',
  skull: 'A skull',
  car: 'A car',
  phone: 'A phone',
  screen: 'A screen',
  bubble: 'A speech bubble',
  abstract: 'An abstraction',
};

export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

export function resample(pts, step) {
  if (pts.length < 2) return pts.map((p) => ({ ...p }));
  const src = pts.map((p) => ({ ...p }));
  const out = [src[0]];
  let D = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1];
    const b = src[i];
    const d = dist(a, b);
    if (d > 0 && D + d >= step) {
      const k = (step - D) / d;
      const q = {
        x: a.x + k * (b.x - a.x),
        y: a.y + k * (b.y - a.y),
        t: (a.t ?? 0) + k * ((b.t ?? 0) - (a.t ?? 0)),
      };
      out.push(q);
      src.splice(i, 0, q);
      D = 0;
    } else {
      D += d;
    }
  }
  const last = src[src.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.25) out.push(last);
  return out;
}

function smooth(pts) {
  if (pts.length < 3) return pts.map((p) => ({ ...p }));
  const out = [{ ...pts[0] }];
  for (let i = 1; i < pts.length - 1; i++) {
    out.push({
      x: (pts[i - 1].x + pts[i].x * 2 + pts[i + 1].x) / 4,
      y: (pts[i - 1].y + pts[i].y * 2 + pts[i + 1].y) / 4,
      t: pts[i].t,
    });
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

function bbox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function mean(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

// ---------- Per-stroke geometry ----------

export function strokeInfo(stroke) {
  // Densify first so smoothing only rounds corners slightly, however sparse the input points are.
  let raw = stroke.points.length > 1 ? resample(stroke.points, 0.004) : stroke.points;
  for (let pass = 0; pass < PASSES; pass++) raw = smooth(raw);
  const L = pathLength(raw);
  const bb = bbox(raw);
  const diag = Math.hypot(bb.w, bb.h);
  const first = raw[0];
  const last = raw[raw.length - 1];
  const chord = dist(first, last);
  const dur = Math.max(0, ((last.t ?? 0) - (first.t ?? 0)) / 1000);
  const info = {
    L, bb, diag, chord, dur, size: stroke.size ?? 0.013,
    straightness: L > 0 ? chord / L : 1,
    centroid: { x: bb.cx, y: bb.cy },
    corners: 0, sharpCorners: 0, cornerTurn: 0, alternation: 0, sameSign: 0,
    signed: 0, abs: 0, windings: 0, inflections: 0, flipRate: 0,
    cv: 1, radialRatio: 1, closed: false, peak: false,
    cornerPts: [], outwardSharp: 0, outwardPoints: 0, windingsClosed: 0, inwardCorners: 0, concave: 0, polygonness: 0, fill: 0, lobes: 0, depth: 0,
    p0: first, p1: last,
    orientation: Math.atan2(last.y - first.y, last.x - first.x),
    shape: 'dot', segs: [],
  };
  if (L < 0.025 || raw.length < 3) {
    info.shape = 'dot';
    return info;
  }

  const step = clamp(diag / 24, 0.004, 0.025);
  const c = resample(raw, step);
  info.segs = c;

  const headings = [];
  for (let i = 1; i < c.length; i++) headings.push(Math.atan2(c[i].y - c[i - 1].y, c[i].x - c[i - 1].x));
  const turns = [];
  for (let i = 1; i < headings.length; i++) turns.push(wrap(headings[i] - headings[i - 1]));

  let signed = 0, abs = 0;
  for (const t of turns) { signed += t; abs += Math.abs(t); }
  info.signed = signed;
  info.abs = abs;
  info.windings = Math.abs(signed) / TAU;

  // Corner detection: heading change across a two-segment window, with non-max suppression.
  // A corner turns a lot within two segments but little in the segments around it,
  // which separates real corners from tight but smooth curves (like wave crests).
  const win = [];
  const sharp = [];
  for (let i = 1; i < headings.length - 1; i++) {
    const w1 = wrap(headings[i + 1] - headings[i - 1]);
    const a = Math.max(0, i - 3);
    const b = Math.min(headings.length - 1, i + 3);
    const w3 = wrap(headings[b] - headings[a]);
    win.push(w1);
    sharp.push(Math.abs(w3) > 1e-6 ? Math.abs(w1) / Math.abs(w3) : 1);
  }
  const corners = [];
  for (let i = 0; i < win.length; i++) {
    const v = Math.abs(win[i]);
    if (v < 1.0 || (v < 2.4 && sharp[i] < 0.6)) continue;
    const prev = i > 0 ? Math.abs(win[i - 1]) : 0;
    const next = i < win.length - 1 ? Math.abs(win[i + 1]) : 0;
    if (v >= prev && v > next) {
      if (corners.length && i - corners[corners.length - 1].i <= 2) {
        if (v > Math.abs(corners[corners.length - 1].turn)) corners[corners.length - 1] = { i, turn: win[i] };
      } else {
        corners.push({ i, turn: win[i] });
      }
    }
  }
  // Where each corner sits on the page (between the segments either side of it).
  for (const k of corners) {
    const a = c[Math.min(c.length - 1, k.i + 1)];
    const b = c[Math.min(c.length - 1, k.i + 2)];
    k.pt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  // A closed shape also turns where its end meets its start (a square drawn from a corner).
  const closedEarly = L > 0.08 && chord < Math.max(0.03, 0.22 * diag);
  if (closedEarly && headings.length > 6) {
    const vec = (hs) => Math.atan2(hs.reduce((t, h) => t + Math.sin(h), 0), hs.reduce((t, h) => t + Math.cos(h), 0));
    const turn = wrap(vec(headings.slice(0, 2)) - vec(headings.slice(-2)));
    const nearEnds = corners.some((k) => k.i <= 1 || k.i >= win.length - 2);
    if (Math.abs(turn) > 1.0 && !nearEnds) corners.push({ i: -1, turn, pt: { x: c[0].x, y: c[0].y } });
    info.windingsClosed = Math.abs(signed + turn) / TAU;
  }
  info.cornerPts = corners;
  info.corners = corners.length;
  info.sharpCorners = corners.filter((k) => Math.abs(k.turn) > 1.8).length;
  info.cornerTurn = corners.reduce((s, k) => s + Math.abs(k.turn), 0);
  if (corners.length > 1) {
    let alt = 0, same = 0;
    for (let i = 1; i < corners.length; i++) {
      if (Math.sign(corners[i].turn) !== Math.sign(corners[i - 1].turn)) alt++;
      else same++;
    }
    info.alternation = alt / (corners.length - 1);
    info.sameSign = same / (corners.length - 1);
  }

  // Inflections: count sign changes between significant runs of turning.
  const runs = [];
  let runSign = 0, runSum = 0;
  for (const t of turns) {
    if (Math.abs(t) < 0.02) continue;
    const s = Math.sign(t);
    if (runSign === 0) { runSign = s; runSum = t; }
    else if (s === runSign) runSum += t;
    else {
      if (Math.abs(runSum) > 0.35) runs.push(runSum);
      runSign = s; runSum = t;
    }
  }
  if (Math.abs(runSum) > 0.35) runs.push(runSum);
  let infl = 0;
  for (let i = 1; i < runs.length; i++) if (Math.sign(runs[i]) !== Math.sign(runs[i - 1])) infl++;
  info.inflections = infl;

  // Jitter: how often the turn direction flips.
  let flips = 0, counted = 0, prevS = 0;
  for (const t of turns) {
    if (Math.abs(t) < 0.05) continue;
    const s = Math.sign(t);
    if (prevS !== 0) { counted++; if (s !== prevS) flips++; }
    prevS = s;
  }
  info.flipRate = counted ? flips / counted : 0;

  // Radial profile around the centroid of the resampled path.
  const cx = mean(c.map((p) => p.x));
  const cy = mean(c.map((p) => p.y));
  info.centroid = { x: cx, y: cy };
  const r = c.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const rm = mean(r);
  const rs = Math.sqrt(mean(r.map((v) => (v - rm) ** 2)));
  info.cv = rm > 0 ? rs / rm : 1;
  const q = Math.max(2, Math.floor(r.length / 4));
  const r0 = mean(r.slice(0, q));
  const r1 = mean(r.slice(-q));
  info.radialRatio = r0 > 1e-4 ? r1 / r0 : 99;

  info.closed = closedEarly;
  info.polygonness = abs > 0 ? info.cornerTurn / abs : 0;

  // Corners pointing out (tips of a star, a crescent's horns) vs in (between petals, a heart's notch).
  for (const k of corners) {
    const rc = Math.hypot(k.pt.x - cx, k.pt.y - cy);
    if (Math.abs(k.turn) > 1.8 && rc > rm * 1.1) info.outwardSharp++;
    if (Math.abs(k.turn) > 1.3 && rc > rm * 1.1) info.outwardPoints++;
    if (rc < rm * 0.9) info.inwardCorners++;
    // Turning against the shape's overall direction: a dent (cloud cusps, heart notch).
    if (info.closed && Math.abs(k.turn) > 0.9 && Math.sign(k.turn) !== Math.sign(signed)) info.concave++;
  }

  if (info.closed && c.length > 8) {
    // Enclosed area relative to the bounding box: circle ≈ 0.78, crescent well under half.
    let area = 0;
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      area += a.x * b.y - b.x * a.y;
    }
    info.fill = bb.w * bb.h > 0 ? Math.abs(area / 2) / (bb.w * bb.h) : 0;

    // Lobes: how many times the outline swings out and back in (petals, cloud puffs).
    const hi = rm * 1.12, lo = rm * 0.88;
    const start = r.findIndex((v) => v < lo);
    if (start >= 0) {
      let state = 'lo', lobes = 0;
      for (let n = 0; n < r.length; n++) {
        const v = r[(start + n) % r.length];
        if (state === 'lo' && v > hi) { state = 'hi'; lobes++; }
        else if (state === 'hi' && v < lo) state = 'lo';
      }
      info.lobes = lobes;
    }
    info.depth = rm > 0 ? (Math.max(...r) - Math.min(...r)) / rm : 0;
  }

  // Peak: the highest point sits in the middle and both ends drop well below it.
  let minI = 0;
  for (let i = 1; i < c.length; i++) if (c[i].y < c[minI].y) minI = i;
  const frac = minI / (c.length - 1);
  info.peak = !info.closed && bb.h > 0.06 && frac > 0.15 && frac < 0.85 &&
    first.y - bb.minY > 0.45 * bb.h && last.y - bb.minY > 0.45 * bb.h;

  info.shape = classifyStroke(info);
  return info;
}

function classifyStroke(s) {
  const aspect = s.bb.h > 0 ? s.bb.w / s.bb.h : 99;
  const spiralish = s.radialRatio > 1.7 || s.radialRatio < 0.6;
  const roundish = s.windingsClosed >= 0.7 && s.windingsClosed < 1.45 && s.windings < 1.6;

  if (s.closed && isCrown(s)) return 'crown';
  if (s.outwardSharp >= 4 && s.outwardSharp <= 8 && (s.sameSign >= 0.7 || s.closed)) return 'star';
  if (s.windings >= 1.4 && spiralish && s.corners <= 3) return 'spiral';

  if (s.closed && roundish) {
    if (isHeart(s, aspect)) return 'heart';
    if (isDiamond(s)) return 'diamond';
    if (isDrop(s, aspect)) return 'drop';
    if (isBubble(s, aspect)) return 'bubble';
    if (isFlame(s, aspect)) return 'flame';
    if (s.outwardPoints === 2 && s.lobes <= 2 && s.fill > 0 && s.fill < 0.45) return 'moon';
    if (s.outwardPoints === 2 && s.corners <= 3 && s.fill >= 0.45 && (aspect > 1.5 || aspect < 0.67)) return 'lens';
    if ((s.lobes >= 4 || s.concave >= 4) && s.depth >= 0.45 && aspect > 0.65 && aspect < 1.5 && s.outwardSharp <= 1) return 'flower';
    if (s.concave >= 3 && s.outwardSharp <= 1 && (aspect >= 1.15 || s.depth < 0.45)) return 'cloud';
    if (s.polygonness >= 0.4 && s.corners >= 3) {
      // Three corners: a square with a softened corner fills its box, a house front a bit less, a triangle half.
      if (s.corners === 3) return s.fill > 0.86 ? boxKind(aspect) : s.fill > 0.65 && isHouse(s) ? 'house' : 'mountain';
      if (s.corners >= 4 && s.corners <= 6 && isHouse(s)) return 'house';
      if (s.corners >= 4 && s.corners <= 5 && aspect > 0.25 && aspect < 4) return boxKind(aspect);
    }
    if (s.cv < 0.25 && aspect > 0.45 && aspect < 2.2 && s.corners <= 2 && s.polygonness < 0.35) return 'circle';
  }
  if (s.closed && s.corners >= 2 && s.corners <= 5 && s.polygonness >= 0.35) {
    if (s.corners >= 3 && s.fill > 0.65 && s.fill <= 0.86 && isHouse(s)) return 'house';
    return s.corners >= 4 || s.fill > 0.86 ? boxKind(aspect) : 'mountain';
  }
  if (s.windings >= 1.4 && s.corners <= 4) return 'loops';
  if (s.straightness > 0.9) return 'line';
  if (!s.closed && isArrow(s)) return 'arrow';
  if (!s.closed && isBird(s, aspect)) return 'bird';
  if (!s.closed && isMoneyS(s, aspect)) return 'money';
  if (!s.closed && s.corners >= 2 && s.alternation >= 0.6 && s.straightness > 0.25 && s.cornerTurn / s.corners >= 1.5) return 'zigzag';
  if (s.peak && s.inflections < 2 && s.corners >= 1 && s.corners <= 3) return 'mountain';
  if (!s.closed && s.inflections >= 2 && s.sharpCorners <= 1 && s.straightness > 0.3) return 'wave';
  if (s.L > 0.3 && (s.abs / s.L > 45 || s.flipRate > 0.45)) return 'scribble';
  if (s.peak) return 'mountain';
  return 'curve';
}

// Rectangles: tall reads as a phone, wide as a screen, squarish as a box.
function boxKind(aspect) {
  if (aspect < 0.62) return 'phone';
  if (aspect > 1.6) return 'screen';
  return 'box';
}

const convex = (s, k, min = 1.0) => Math.abs(k.turn) > min && Math.sign(k.turn) === Math.sign(s.signed || 1);
const dent = (s, k) => Math.abs(k.turn) > 0.9 && Math.sign(k.turn) !== Math.sign(s.signed || 1);

// Crown: three or more points along the top, dents between them, a flat base.
function isCrown(s) {
  const { bb } = s;
  const tips = s.cornerPts.filter((k) => convex(s, k, 1.2) && k.pt.y < bb.minY + 0.4 * bb.h);
  const base = s.cornerPts.filter((k) => convex(s, k, 0.9) && k.pt.y > bb.minY + 0.75 * bb.h);
  const dents = s.cornerPts.filter((k) => dent(s, k) && k.pt.y < bb.minY + 0.75 * bb.h);
  const lowDents = s.cornerPts.filter((k) => dent(s, k) && k.pt.y > bb.minY + 0.65 * bb.h);
  if (tips.length < 3 || base.length < 1 || dents.length < 2 || lowDents.length || bb.w < 0.6 * bb.h || s.polygonness < 0.4) return false;
  // The base is a straight edge across most of the width (a star has legs, a flame a round bottom).
  const xs = s.segs.filter((p) => p.y > bb.maxY - 0.08 * bb.h).map((p) => p.x).sort((a, b) => a - b);
  if (!xs.length || xs[xs.length - 1] - xs[0] < 0.5 * bb.w) return false;
  // One unbroken edge, not two feet with a gap between them.
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 0.15 * bb.w) return false;
  return true;
}

// Diamond: a square standing on its point, with corners at the middle of each side of its box.
function isDiamond(s) {
  const { bb } = s;
  if (s.polygonness < 0.35 || s.fill < 0.35 || s.fill > 0.7 || !s.segs.length) return false;
  const near = (p, x, y) => Math.abs(p.x - x) < 0.18 * bb.w && Math.abs(p.y - y) < 0.18 * bb.h;
  const pts = s.segs;
  const top = pts.reduce((a, p) => (p.y < a.y ? p : a));
  const bot = pts.reduce((a, p) => (p.y > a.y ? p : a));
  const left = pts.reduce((a, p) => (p.x < a.x ? p : a));
  const right = pts.reduce((a, p) => (p.x > a.x ? p : a));
  // A flat top or bottom edge (a triangle's base) rules it out.
  const flat = (y) => { const xs = pts.filter((p) => Math.abs(p.y - y) < 0.05 * bb.h).map((p) => p.x); return xs.length && Math.max(...xs) - Math.min(...xs) > 0.3 * bb.w; };
  if (!(near(top, bb.cx, bb.minY) && near(bot, bb.cx, bb.maxY) && near(left, bb.minX, bb.cy) && near(right, bb.maxX, bb.cy))) return false;
  if (flat(bb.minY) || flat(bb.maxY)) return false;
  // At least three of those four extremes must be real corners (an almond or a cloud is smooth there).
  const r = 0.15 * Math.hypot(bb.w, bb.h);
  const cornered = [top, bot, left, right].filter((e) => s.cornerPts.some((k) => convex(s, k, 0.7) && Math.hypot(k.pt.x - e.x, k.pt.y - e.y) < r)).length;
  return cornered >= 3;
}

// Drop: one point at the top, round everywhere else.
function isDrop(s, aspect) {
  if (aspect < 0.4 || aspect > 1.15 || s.concave > 0 || s.fill < 0.4) return false;
  const { bb } = s;
  const points = s.cornerPts.filter((k) => convex(s, k, 0.9));
  if (points.length !== 1) return false;
  const p = points[0].pt;
  return p.y < bb.minY + 0.2 * bb.h && Math.abs(p.x - bb.cx) < 0.25 * bb.w;
}

// Speech bubble: a rounded outline with a single tail poking out underneath.
function isBubble(s, aspect) {
  if (aspect < 0.9 || aspect > 3.2) return false;
  const { bb } = s;
  const points = s.cornerPts.filter((k) => convex(s, k, 0.9));
  if (points.length !== 1) return false;
  const tail = points[0].pt;
  return tail.y > bb.minY + 0.7 * bb.h && s.concave <= 2 && s.polygonness < 0.6;
}

// Flame: two or more tongues licking up from a rounded bottom.
function isFlame(s, aspect) {
  if (aspect < 0.35 || aspect > 1.3) return false;
  const { bb } = s;
  const tips = s.cornerPts.filter((k) => convex(s, k, 0.9) && k.pt.y < bb.minY + 0.5 * bb.h);
  const low = s.cornerPts.filter((k) => convex(s, k, 1.6) && k.pt.y > bb.minY + 0.6 * bb.h); // a soft start point is fine
  // Tongues only point up; petals all the way round make a flower instead.
  const lowerPoints = s.cornerPts.filter((k) => convex(s, k, 0.9) && k.pt.y > bb.cy).length;
  return tips.length >= 2 && low.length === 0 && lowerPoints <= 1 && s.concave >= 1 && s.lobes <= 3;
}

// Dollar sign: an upright S (one or two bends the other way), with or without a line through it.
function isMoneyS(s, aspect) {
  return aspect < 0.8 && s.L > 0.15 && s.inflections >= 1 && s.inflections <= 3 && s.sharpCorners <= 1
    && s.straightness < 0.85 && s.abs > 3 && s.windings < 1.2;
}

// Heart: a point at the bottom middle and a notch dipping into the top middle.
function isHeart(s, aspect) {
  if (aspect < 0.6 || aspect > 1.7 || !s.segs.length) return false;
  const { bb } = s;
  if (s.concave > 2) return false; // clouds have many dents; a heart has one
  // A heart's top is two round lobes: sharp points up there make it a flame or a crown instead.
  if (s.cornerPts.some((k) => Math.abs(k.turn) > 1.3 && Math.sign(k.turn) === Math.sign(s.signed || 1) && k.pt.y < s.bb.minY + 0.35 * s.bb.h)) return false;
  const convex = (k) => Math.abs(k.turn) > 1.3 && Math.sign(k.turn) === Math.sign(s.signed || 1);
  const tip = s.cornerPts.some((k) => convex(k) && k.pt.y > bb.maxY - 0.15 * bb.h && Math.abs(k.pt.x - bb.cx) < 0.2 * bb.w);
  if (!tip) return false;
  // The notch: a corner (or the outline itself) dipping well below the top, near the middle.
  const notchCorner = s.cornerPts.some((k) => k.pt.y < bb.cy && Math.abs(k.pt.x - bb.cx) < 0.15 * bb.w && k.pt.y - bb.minY > 0.12 * bb.h);
  const mid = s.segs.filter((p) => Math.abs(p.x - bb.cx) < 0.03 * bb.w);
  const dip = mid.length ? Math.min(...mid.map((p) => p.y)) - bb.minY : 0;
  return notchCorner || dip > 0.15 * bb.h;
}

// House outline in one stroke: a roof peak at the top middle over a flat-bottomed box.
function isHouse(s) {
  const { bb } = s;
  const pts = s.cornerPts.map((k) => k.pt).sort((a, b) => a.y - b.y);
  const top = pts[0];
  const bottom = pts.slice(-2);
  return top.y < bb.minY + 0.1 * bb.h && Math.abs(top.x - bb.cx) < 0.2 * bb.w
    && Math.abs(bottom[0].y - bottom[1].y) < 0.15 * bb.h && bottom[0].y > bb.minY + 0.6 * bb.h;
}

// Arrow in one stroke: a long straight shaft, then a sharp turn back into a short head.
function isArrow(s) {
  if (s.corners < 1 || s.corners > 3 || s.segs.length < 6) return false;
  const ks = s.cornerPts.filter((k) => k.i >= 0).sort((a, b) => a.i - b.i);
  const idx = [0, ...ks.map((k) => k.i + 1), s.segs.length - 1];
  const pieces = [];
  for (let n = 1; n < idx.length; n++) pieces.push(pathLength(s.segs.slice(idx[n - 1], idx[n] + 1)));
  const longest = Math.max(...pieces);
  const at = pieces.indexOf(longest);
  const joint = at === 0 ? ks[0] : at === pieces.length - 1 ? ks[ks.length - 1] : null;
  return !!joint && longest > 0.5 * s.L && Math.abs(joint.turn) > 2.0
    && pieces.every((p, n) => n === at || p < 0.4 * longest);
}

// Bird: two wings rising either side of a cusp in the middle, wider than tall.
function isBird(s, aspect) {
  const cusps = s.cornerPts.filter((k) => Math.abs(k.turn) > 1.2);
  if (aspect < 1.3 || s.L > 0.7 || cusps.length < 1 || cusps.length > 2) return false;
  const cusp = cusps
    .find((k) => k.pt.x > s.bb.minX + 0.3 * s.bb.w && k.pt.x < s.bb.maxX - 0.3 * s.bb.w);
  if (!cusp) return false;
  const left = s.segs.filter((p) => p.x < cusp.pt.x);
  const right = s.segs.filter((p) => p.x > cusp.pt.x);
  if (!left.length || !right.length) return false;
  const rise = 0.25 * s.bb.h;
  return Math.min(...left.map((p) => p.y)) < cusp.pt.y - rise && Math.min(...right.map((p) => p.y)) < cusp.pt.y - rise;
}

// ---------- Global features ----------

function segmentsIntersect(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function countIntersections(strokes) {
  const segs = [];
  strokes.forEach((s, si) => {
    const pts = resample(s.points, 0.02);
    for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i], si, i });
  });
  if (segs.length > 1500) return 40; // so much ink it is definitely tangled
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i], B = segs[j];
      if (A.si === B.si && Math.abs(A.i - B.i) < 3) continue;
      if (segmentsIntersect(A.a, A.b, B.a, B.b)) n++;
    }
  }
  return n;
}

function coverage(strokes, N = 48) {
  const grid = new Uint8Array(N * N);
  for (const s of strokes) {
    const rad = Math.max(0, Math.round(((s.size ?? 0.013) * N) / 2 - 0.4));
    const pts = s.points.length > 1 ? resample(s.points, 0.006) : s.points;
    for (const p of pts) {
      const gx = Math.floor(clamp(p.x, 0, 0.9999) * N);
      const gy = Math.floor(clamp(p.y, 0, 0.9999) * N);
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const x = gx + dx, y = gy + dy;
          if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = 1;
        }
      }
    }
  }
  return { grid, N };
}

function hashStrokes(strokes) {
  let h = 0x811c9dc5;
  const mix = (v) => { h ^= v & 0xff; h = Math.imul(h, 0x01000193); };
  for (const s of strokes) {
    const pts = s.points.length > 1 ? resample(s.points, 0.02) : s.points;
    for (const p of pts) {
      mix(Math.round(p.x * 100));
      mix(Math.round(p.y * 100));
    }
    mix(255);
  }
  return h >>> 0;
}

export function analyze(strokes) {
  const live = strokes.filter((s) => s.points && s.points.length > 0);
  const infos = live.map(strokeInfo);
  const totalLen = infos.reduce((s, i) => s + i.L, 0);
  const totalDur = infos.reduce((s, i) => s + i.dur, 0);

  // Coverage, height and symmetry from a coarse raster.
  const { grid, N } = coverage(live);
  let filled = 0, sumY = 0, gx0 = N, gx1 = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!grid[y * N + x]) continue;
      filled++; sumY += y;
      if (x < gx0) gx0 = x;
      if (x > gx1) gx1 = x;
    }
  }
  let mirrored = 0;
  const mid = (gx0 + gx1) / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!grid[y * N + x]) continue;
      const mx = Math.round(2 * mid - x);
      for (let k = -1; k <= 1; k++) {
        const xx = mx + k;
        if (xx >= 0 && xx < N && grid[y * N + xx]) { mirrored++; break; }
      }
    }
  }
  const cov = filled / (N * N);

  const intersections = countIntersections(live);
  const allCorners = infos.reduce((s, i) => s + i.corners, 0);
  const absTurn = infos.reduce((s, i) => s + i.abs, 0);
  const cornerTurn = infos.reduce((s, i) => s + i.cornerTurn, 0);
  const flipRate = totalLen > 0 ? infos.reduce((s, i) => s + i.flipRate * i.L, 0) / totalLen : 0;

  const speed = totalDur > 0.05 ? totalLen / totalDur : 0.9;
  const features = {
    energy: clamp((speed - 0.15) / 1.5),
    angularity: clamp(totalLen > 0 ? allCorners / totalLen / 4 : 0),
    curvature: clamp(totalLen > 0 ? Math.max(0, absTurn - cornerTurn) / totalLen / 7 : 0),
    density: clamp(cov / 0.22),
    chaos: clamp(0.35 * clamp(live.length / 20) + 0.3 * clamp(flipRate / 0.6) + 0.35 * clamp(intersections / 12)),
    height: filled ? clamp(1 - sumY / filled / (N - 1)) : 0.5,
    symmetry: filled ? clamp(mirrored / filled) : 0.5,
  };

  const motif = detectMotif(infos, { totalLen, intersections, features });
  const traits = describe(features);
  return {
    features,
    motif,
    motifLabel: MOTIF_LABELS[motif],
    traits,
    hash: hashStrokes(live),
    stats: { strokes: live.length, totalLen, intersections, shapes: infos.map((i) => i.shape) },
  };
}

function inside(p, bb, shrink = 0.1) {
  const sx = bb.w * shrink, sy = bb.h * shrink;
  return p.x > bb.minX + sx && p.x < bb.maxX - sx && p.y > bb.minY + sy && p.y < bb.maxY - sy;
}

function lineCross(a, b) {
  // Where two straight strokes cross, as fractions along each (null if they don't).
  const d1x = a.p1.x - a.p0.x, d1y = a.p1.y - a.p0.y;
  const d2x = b.p1.x - b.p0.x, d2y = b.p1.y - b.p0.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const ex = b.p0.x - a.p0.x, ey = b.p0.y - a.p0.y;
  const t = (ex * d2y - ey * d2x) / den;
  const u = (ex * d1y - ey * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

function quadrants(points, cx, cy) {
  return new Set(points.map((p) => (p.x >= cx ? 1 : 0) + (p.y >= cy ? 2 : 0))).size;
}

function hasRoofOver(box, infos) {
  return infos.some((i) => i !== box && (i.shape === 'mountain' || i.shape === 'zigzag' || i.peak)
    && i.bb.cy < box.bb.cy && i.bb.maxY > box.bb.minY - 0.25 * box.bb.h && i.bb.maxY < box.bb.minY + 0.35 * box.bb.h
    && i.bb.cx > box.bb.minX && i.bb.cx < box.bb.maxX);
}

function detectMotif(infos, { totalLen, intersections, features }) {
  if (!infos.length) return 'abstract';
  const dotCount = infos.filter((i) => i.shape === 'dot').length;
  if (dotCount >= 6 && dotCount >= infos.length * 0.5) return 'dots';
  if (totalLen < 0.02) return 'abstract';
  const marks = infos.filter((i) => i.shape !== 'dot' || infos.length < 6);
  const byLen = [...infos].sort((a, b) => b.L - a.L);
  const circles = byLen.filter((i) => i.shape === 'circle' && i.diag > 0.06);

  for (const c of circles) {
    const inner = infos.filter((i) => i !== c && i.L < c.L * 0.8 && inside(i.centroid, c.bb, 0.08));
    if (!inner.length) continue;
    const R = Math.max(c.bb.w, c.bb.h) / 2;
    const center = { x: c.bb.cx, y: c.bb.cy };
    const straight = inner.filter((i) => i.straightness > 0.85 && i.L > 0.15 * R);
    // Skull: crossed-out (X) eyes.
    for (let a = 0; a < straight.length; a++) {
      for (let b = a + 1; b < straight.length; b++) {
        const hit = lineCross(straight[a], straight[b]);
        const ang = Math.abs(wrap(straight[a].orientation - straight[b].orientation)) % Math.PI;
        if (hit && hit.t > 0.15 && hit.t < 0.85 && hit.u > 0.15 && hit.u < 0.85 && Math.min(ang, Math.PI - ang) > 0.7
          && straight[a].L < 1.2 * R && straight[b].L < 1.2 * R) return 'skull';
      }
    }
    // Globe: long lines or curves running right across it.
    if (inner.filter((i) => i.L > 1.1 * R && i.diag > 1.0 * R).length >= 2) return 'globe';
    // Clock: one or two short hands starting at the middle (tick marks round the edge are fine).
    const hands = straight.filter((i) => i.L < 1.15 * R
      && Math.min(Math.hypot(i.p0.x - center.x, i.p0.y - center.y), Math.hypot(i.p1.x - center.x, i.p1.y - center.y)) < 0.3 * R);
    const ticks = inner.filter((i) => !hands.includes(i) && i.L < 0.35 * R && Math.hypot(i.centroid.x - center.x, i.centroid.y - center.y) > 0.55 * R);
    const hub = inner.filter((i) => i.shape === 'dot' && Math.hypot(i.centroid.x - center.x, i.centroid.y - center.y) < 0.25 * R);
    if (hands.length >= 1 && hands.length <= 2 && hands.length + ticks.length + hub.length === inner.length) return 'clock';
    // Face: a circle with marks inside it. A single mark inside makes an eye.
    if (c.diag > 0.15 && inner.length >= 2) return 'face';
    if (inner.length === 1 && infos.length <= 3 && inner[0].diag < c.diag * 0.6) return 'eye';
  }

  // Car: a body riding on two wheels of about the same size.
  const wheels = infos.filter((i) => (i.shape === 'circle' || i.shape === 'dot' && i.size > 0.02) && i.diag < 0.3);
  for (let a = 0; a < wheels.length; a++) {
    for (let b = a + 1; b < wheels.length; b++) {
      const [w1, w2] = [wheels[a], wheels[b]].sort((p, q) => p.centroid.x - q.centroid.x);
      const D = Math.max(w1.diag, w2.diag, 0.03);
      const similar = Math.min(w1.diag, w2.diag) > 0.5 * Math.max(w1.diag, w2.diag) || (w1.shape === 'dot' && w2.shape === 'dot');
      if (!similar || Math.abs(w1.centroid.y - w2.centroid.y) > 0.5 * D || w2.centroid.x - w1.centroid.x < 1.2 * D) continue;
      const body = infos.find((i) => i !== w1 && i !== w2 && i.L > 2 * (w2.centroid.x - w1.centroid.x)
        && i.bb.minX < w1.centroid.x && i.bb.maxX > w2.centroid.x && i.bb.cy < w1.centroid.y && i.bb.maxY > w1.centroid.y - D);
      if (body) return 'car';
    }
  }

  // Music note: a small head with a stem rising from its side.
  const stems = infos.filter((i) => i.straightness > 0.85 && Math.abs(Math.sin(i.orientation)) > 0.85 && i.L > 0.1);
  const heads = infos.filter((i) => !stems.includes(i) && i.diag < 0.2 && (i.closed || i.shape === 'dot' || i.shape === 'scribble' || i.shape === 'circle'));
  const notes = stems.filter((st) => {
    const bottom = st.p0.y > st.p1.y ? st.p0 : st.p1;
    return heads.some((h) => {
      const r = Math.max(h.diag / 2, 0.02);
      return Math.abs(h.centroid.x - bottom.x) < 1.8 * r && Math.abs(h.centroid.y - bottom.y) < 1.8 * r && st.L > 2.2 * r && h.centroid.y > st.bb.cy;
    });
  });
  if (notes.length && infos.filter((i) => i.L > 0.04).length <= 3 * notes.length + 2) return 'note';

  // Dollar sign: an upright S with a line through it.
  const sCurves = infos.filter((i) => i.shape === 'money');
  if (sCurves.length && infos.every((i) => sCurves.includes(i) || (i.straightness > 0.85 && Math.abs(Math.sin(i.orientation)) > 0.8))) return 'money';

  // Stick figure: a small round head with a body hanging below it.
  for (const c of circles) {
    if (c.diag > 0.4) continue;
    const D = Math.max(c.bb.w, c.bb.h);
    const body = infos.filter((i) => i !== c && i.shape !== 'dot' && !i.closed && i.centroid.y > c.bb.maxY - 0.02
      && Math.abs(i.centroid.x - c.bb.cx) < 2.5 * D);
    const above = infos.filter((i) => i !== c && i.centroid.y < c.bb.minY).length;
    const neck = body.some((i) => i.bb.minY < c.bb.maxY + 0.6 * D);
    const bodyLen = body.reduce((t, i) => t + i.L, 0);
    const reach = body.length ? Math.max(...body.map((i) => i.bb.maxY)) : 0;
    if (neck && above <= 1 && (body.length >= 2 || body[0].corners >= 2) && bodyLen > 2 * D && reach > c.bb.maxY + 1.5 * D) return 'figure';
  }

  // Around a circle: curved, closed petals make a flower; straight rays spread all round make a sun.
  for (const c of circles) {
    const R = Math.max(c.bb.w, c.bb.h);
    const around = infos.filter((i) => {
      if (i === c || i.diag > R * 3) return false;
      const d = Math.hypot(i.centroid.x - c.bb.cx, i.centroid.y - c.bb.cy);
      return d > R * 0.45 && d < R * 1.8 + i.diag * 0.5;
    });
    if (around.length < 4) continue;
    const curvy = around.filter((i) => i.closed || i.straightness < 0.75).length;
    if (curvy >= around.length * 0.6) return 'flower';
    if (quadrants(around.map((i) => i.centroid), c.bb.cx, c.bb.cy) >= 3) return 'sun';
  }

  // Eye: an almond outline with something inside.
  for (const l of infos.filter((i) => i.shape === 'lens')) {
    if (infos.some((i) => i !== l && inside(i.centroid, l.bb, 0.15))) return 'eye';
  }

  // House: a box with a roof on top (either can be one stroke).
  for (const b of infos.filter((i) => ['box', 'phone', 'screen'].includes(i.shape))) if (hasRoofOver(b, infos)) return 'house';

  const lines = infos.filter((i) => i.straightness > 0.88 && i.L > 0.06);

  // Cross: two straight strokes crossing near their middles at a wide angle.
  const nonTiny = infos.filter((i) => i.L > 0.04);
  if (lines.length === 2 && nonTiny.length <= 3) {
    const [a, b] = lines;
    const hit = lineCross(a, b);
    const angle = Math.abs(wrap(a.orientation - b.orientation)) % Math.PI;
    const wide = Math.min(angle, Math.PI - angle) > 0.95;
    if (hit && wide && hit.t > 0.12 && hit.t < 0.88 && hit.u > 0.12 && hit.u < 0.88) return 'cross';
  }

  // Arrow: a long shaft with a head (a V, or two short strokes) at one end.
  const shaft = lines.filter((l) => l.L > 0.15).sort((a, b) => b.L - a.L)[0];
  if (shaft && infos.length <= 4) {
    for (const end of [shaft.p0, shaft.p1]) {
      const near = (p) => Math.hypot(p.x - end.x, p.y - end.y) < 0.08;
      const others = infos.filter((i) => i !== shaft && i.L < shaft.L * 0.6 && i.shape !== 'dot');
      const vHead = others.some((i) => i.corners >= 1 && i.L < 0.5 && (i.segs.length ? i.segs : [i.p0, i.p1]).some(near));
      const barbs = others.filter((i) => near(i.p0) || near(i.p1)).length;
      if (vHead || barbs >= 2) return 'arrow';
    }
  }

  // Asterisk star: three or more lines crossing at a shared centre.
  if (lines.length >= 3) {
    const mx = mean(lines.map((l) => l.centroid.x));
    const my = mean(lines.map((l) => l.centroid.y));
    const near = lines.filter((l) => Math.hypot(l.centroid.x - mx, l.centroid.y - my) < 0.1);
    const orient = new Set(near.map((l) => Math.round((((l.orientation % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 6)) % 6));
    if (near.length >= 3 && orient.size >= 3 && near.length >= lines.length * 0.6) return 'star';
  }

  // Horizontals and verticals: crossing past each other is a grid; meeting at the ends is a box.
  const horiz = lines.filter((l) => Math.abs(Math.cos(l.orientation)) > 0.9);
  const vert = lines.filter((l) => Math.abs(Math.sin(l.orientation)) > 0.9);
  if (horiz.length >= 2 && vert.length >= 2) {
    const hx = horiz.flatMap((l) => [l.p0.x, l.p1.x]);
    const vy = vert.flatMap((l) => [l.p0.y, l.p1.y]);
    const vx = vert.map((l) => l.centroid.x);
    const hy = horiz.map((l) => l.centroid.y);
    const w = Math.max(...hx) - Math.min(...hx) || 1;
    const h = Math.max(...vy) - Math.min(...vy) || 1;
    const overhangX = Math.min(Math.min(...vx) - Math.min(...hx), Math.max(...hx) - Math.max(...vx)) / w;
    const overhangY = Math.min(Math.min(...hy) - Math.min(...vy), Math.max(...vy) - Math.max(...hy)) / h;
    if (horiz.length === 2 && vert.length === 2 && overhangX < 0.1 && overhangY < 0.1) {
      const box = { bb: bbox([...horiz, ...vert].flatMap((l) => [l.p0, l.p1])) };
      return hasRoofOver(box, infos) ? 'house' : boxKind(box.bb.h > 0 ? box.bb.w / box.bb.h : 99);
    }
    return 'grid';
  }

  // Rain: many short, near-vertical strokes.
  const drops = infos.filter((i) => i.L > 0.02 && i.L < 0.22 && i.straightness > 0.8 && Math.abs(Math.sin(i.orientation)) > 0.75);
  if (drops.length >= 5 && drops.length >= infos.length * 0.6) return 'rain';

  // Stacked horizontals read as a horizon / landscape.
  if (horiz.length >= 3 && horiz.length >= infos.length * 0.7) return 'horizon';

  // Otherwise vote by shape, weighted by ink length.
  const votes = {};
  for (const i of marks) {
    if (i.shape === 'dot' || i.shape === 'curve') continue;
    let shape = i.shape === 'lens' ? 'eye' : i.shape;
    if (shape === 'line') {
      const horizontal = Math.abs(Math.cos(i.orientation)) > 0.9;
      shape = horizontal && i.L > 0.3 ? 'horizon' : 'line';
    }
    votes[shape] = (votes[shape] || 0) + i.L;
  }
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= totalLen * 0.4) {
    if (best[0] === 'line' && infos.length > 3) return features.chaos > 0.5 ? 'scribble' : 'rain';
    return best[0];
  }

  if (features.chaos > 0.55 || intersections > 10) return 'scribble';
  if (best && best[1] >= totalLen * 0.25) return best[0];
  return 'abstract';
}

function describe(f) {
  return DIMS
    .map((d) => ({ d, v: f[d], w: Math.abs(f[d] - 0.5) }))
    .filter((x) => x.v > 0.62 || x.v < 0.3)
    .sort((a, b) => b.w - a.w)
    .slice(0, 3)
    .map((x) => TRAIT_WORDS[x.d][x.v > 0.5 ? 1 : 0]);
}
