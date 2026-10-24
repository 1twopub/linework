// Linework — compact drawing codes for the feed.
// A code looks like "LW1.<base64url>". Each point is packed into 3 bytes (12-bit x, 12-bit y),
// each stroke keeps its pen size and duration, so the drawing's speed survives the round trip.

const SIZES = [0.006, 0.013, 0.028];
const Q = 4095;
export const MAX_CODE = 20000; // characters; well under GitHub's 65,536-character issue limit

function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const A = pts[a], B = pts[b];
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    let far = -1, fd = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (pts[i].x - A.x) - dx * (pts[i].y - A.y)) / len;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0 && fd > eps) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const toB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

function pack(strokes, eps) {
  const parts = strokes.filter((s) => s.points?.length).slice(0, 300).map((s) => {
    const pts = s.points.length > 2 ? rdp(s.points, eps) : s.points;
    const dur = Math.max(0, (s.points[s.points.length - 1].t ?? 0) - (s.points[0].t ?? 0));
    let size = 1;
    SIZES.forEach((v, i) => { if (Math.abs(v - (s.size ?? 0.013)) < Math.abs(SIZES[size] - (s.size ?? 0.013))) size = i; });
    return { size, dur: Math.min(65535, Math.round(dur / 10)), pts: pts.slice(0, 65535) };
  });
  const total = 3 + parts.reduce((t, p) => t + 5 + p.pts.length * 3, 0);
  const b = new Uint8Array(total);
  let o = 0;
  b[o++] = 1; // version
  b[o++] = parts.length >> 8; b[o++] = parts.length & 255;
  for (const p of parts) {
    b[o++] = p.size;
    b[o++] = p.dur >> 8; b[o++] = p.dur & 255;
    b[o++] = p.pts.length >> 8; b[o++] = p.pts.length & 255;
    for (const q of p.pts) {
      const x = Math.round(Math.min(1, Math.max(0, q.x)) * Q);
      const y = Math.round(Math.min(1, Math.max(0, q.y)) * Q);
      b[o++] = x >> 4; b[o++] = ((x & 15) << 4) | (y >> 8); b[o++] = y & 255;
    }
  }
  return `LW1.${toB64(b)}`;
}

// Strokes -> code, simplifying more until it fits. Returns null if the drawing is too detailed.
export function encodeDrawing(strokes) {
  for (let eps = 0.0015; eps < 0.03; eps *= 1.6) {
    const code = pack(strokes, eps);
    if (code.length <= MAX_CODE) return code;
  }
  return null;
}

// Code -> strokes. Times are spread along each stroke so its speed matches the original.
export function decodeDrawing(code) {
  if (typeof code !== 'string' || !/^LW1\.[A-Za-z0-9_-]+$/.test(code) || code.length > MAX_CODE + 10) throw new Error('Not a drawing code');
  const b = fromB64(code.slice(4));
  let o = 0;
  const need = (n) => { if (o + n > b.length) throw new Error('Truncated drawing code'); };
  need(3);
  if (b[o++] !== 1) throw new Error('Unknown drawing version');
  const n = (b[o++] << 8) | b[o++];
  if (n < 1 || n > 300) throw new Error('Bad stroke count');
  const strokes = [];
  let T = 0;
  for (let k = 0; k < n; k++) {
    need(5);
    const size = SIZES[b[o++]];
    if (size === undefined) throw new Error('Bad pen size');
    const dur = ((b[o++] << 8) | b[o++]) * 10;
    const m = (b[o++] << 8) | b[o++];
    if (m < 1) throw new Error('Empty stroke');
    need(m * 3);
    const pts = [];
    for (let i = 0; i < m; i++) {
      const x = (b[o] << 4) | (b[o + 1] >> 4);
      const y = ((b[o + 1] & 15) << 8) | b[o + 2];
      o += 3;
      pts.push({ x: x / Q, y: y / Q });
    }
    let L = 0;
    const cum = pts.map((p, i) => (i ? (L += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)) : 0));
    pts.forEach((p, i) => { p.t = T + (L > 0 ? (dur * cum[i]) / L : (dur * i) / Math.max(1, m - 1)); });
    T += dur + 250;
    strokes.push({ size, points: pts });
  }
  if (o !== b.length) throw new Error('Trailing data in drawing code');
  return strokes;
}

// SVG markup for a drawing (used by the feed). Pure strings, no DOM needed.
export function drawingSvg(strokes, px = 300) {
  const paths = strokes.map((s) => {
    const w = Math.max(1, s.size * px).toFixed(1);
    if (s.points.length === 1) {
      const p = s.points[0];
      return `<circle cx="${(p.x * px).toFixed(1)}" cy="${(p.y * px).toFixed(1)}" r="${(w / 2).toFixed(1)}" fill="#141311"/>`;
    }
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${(p.x * px).toFixed(1)} ${(p.y * px).toFixed(1)}`).join('');
    return `<path d="${d}" fill="none" stroke="#141311" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" role="img">${paths}</svg>`;
}
