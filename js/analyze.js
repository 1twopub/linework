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

function strokeInfo(stroke) {
  const raw = smooth(stroke.points);
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

  info.closed = L > 0.08 && chord < Math.max(0.03, 0.22 * diag);

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
  if (s.sharpCorners >= 4 && s.sharpCorners <= 8 && s.sameSign >= 0.7) return 'star';
  if (s.windings >= 1.4 && spiralish && s.corners <= 3) return 'spiral';
  if (s.closed && s.windings >= 0.7 && s.windings < 1.45 && s.cv < 0.25 && aspect > 0.45 && aspect < 2.2 && s.corners <= 2) return 'circle';
  if (s.closed && s.corners >= 2 && s.corners <= 4) return 'mountain'; // triangle / prism
  if (s.windings >= 1.4 && s.corners <= 4) return 'loops';
  if (s.straightness > 0.9) return 'line';
  if (!s.closed && s.corners >= 2 && s.alternation >= 0.6 && s.straightness > 0.25 && s.cornerTurn / s.corners >= 1.5) return 'zigzag';
  if (s.peak && s.inflections < 2 && s.corners >= 1 && s.corners <= 3) return 'mountain';
  if (!s.closed && s.inflections >= 2 && s.sharpCorners <= 1 && s.straightness > 0.3) return 'wave';
  if (s.L > 0.3 && (s.abs / s.L > 45 || s.flipRate > 0.45)) return 'scribble';
  if (s.peak) return 'mountain';
  return 'curve';
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

function detectMotif(infos, { totalLen, intersections, features }) {
  if (!infos.length) return 'abstract';
  const dotCount = infos.filter((i) => i.shape === 'dot').length;
  if (dotCount >= 6 && dotCount >= infos.length * 0.5) return 'dots';
  if (totalLen < 0.02) return 'abstract';
  const byLen = [...infos].sort((a, b) => b.L - a.L);
  const circles = byLen.filter((i) => i.shape === 'circle' && i.diag > 0.15);

  // Face: a big circle with marks inside it.
  for (const c of circles) {
    const innerMarks = infos.filter((i) => i !== c && i.L < c.L * 0.8 && inside(i.centroid, c.bb, 0.08));
    if (innerMarks.length >= 2) return 'face';
  }
  // Sun: a circle with rays around it.
  for (const c of circles) {
    const R = Math.max(c.bb.w, c.bb.h);
    const rays = infos.filter((i) => {
      if (i === c || i.L > R * 1.2) return false;
      const d = Math.hypot(i.centroid.x - c.bb.cx, i.centroid.y - c.bb.cy);
      return d > R * 0.45 && d < R * 1.6;
    });
    if (rays.length >= 4) return 'sun';
  }

  const lines = infos.filter((i) => i.straightness > 0.88 && i.L > 0.06);
  // Asterisk star: three or more lines crossing at a shared centre.
  if (lines.length >= 3) {
    const mx = mean(lines.map((l) => l.centroid.x));
    const my = mean(lines.map((l) => l.centroid.y));
    const near = lines.filter((l) => Math.hypot(l.centroid.x - mx, l.centroid.y - my) < 0.1);
    const orient = new Set(near.map((l) => Math.round((((l.orientation % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 6)) % 6));
    if (near.length >= 3 && orient.size >= 3 && near.length >= lines.length * 0.6) return 'star';
  }
  // Grid: crossing horizontals and verticals.
  const horiz = lines.filter((l) => Math.abs(Math.cos(l.orientation)) > 0.9);
  const vert = lines.filter((l) => Math.abs(Math.sin(l.orientation)) > 0.9);
  if (horiz.length >= 2 && vert.length >= 2) return 'grid';

  // Rain: many short, near-vertical strokes.
  const drops = infos.filter((i) => i.L > 0.02 && i.L < 0.22 && i.straightness > 0.8 && Math.abs(Math.sin(i.orientation)) > 0.75);
  if (drops.length >= 5 && drops.length >= infos.length * 0.6) return 'rain';

  // Stacked horizontals read as a horizon / landscape.
  if (horiz.length >= 3 && horiz.length >= infos.length * 0.7) return 'horizon';

  // Otherwise vote by shape, weighted by ink length.
  const votes = {};
  for (const i of infos) {
    if (i.shape === 'dot' || i.shape === 'curve') continue;
    let shape = i.shape;
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
