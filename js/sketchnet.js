// Linework — sketch recognition with DoodleNet (ml5.js, MIT licence), trained on Google's
// Quick, Draw! dataset (CC BY 4.0). Plain JavaScript, no libraries: works in the page,
// in the live worker and in Node (the feed builder), with identical results everywhere.
//
// Network: 3 × (conv 3×3 → conv 3×3 → max-pool 2×2), dense 512 (tanh), dense 345 (softmax).
// Input: the drawing as a 28 × 28 image, ink = 1, paper = 0.

export const SIZE = 28;

// ---------- Weights ----------
// Compact file (models/sketchnet.bin): "LWNN" + u32 header length + JSON header + data.
// Each layer's kernel is int8 with one float32 scale per output channel; biases are float32.

export function parseNet(buffer) {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== 'LWNN') throw new Error('Not a sketch model');
  const view = new DataView(buffer);
  const hlen = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + hlen)));
  let o = 8 + hlen;
  const layers = header.layers.map((L) => {
    const n = L.shape.reduce((a, b) => a * b, 1);
    const outC = L.shape[L.shape.length - 1];
    const q = new Int8Array(buffer.slice(o, o + n)); o += n;
    o = (o + 3) & ~3;
    const scale = new Float32Array(buffer.slice(o, o + outC * 4)); o += outC * 4;
    const bias = new Float32Array(buffer.slice(o, o + outC * 4)); o += outC * 4;
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = q[i] * scale[i % outC];
    return { ...L, w, bias };
  });
  return { classes: header.classes, layers };
}

// ---------- Forward pass ----------

function conv3x3(input, H, W, C, layer) {
  const { w, bias } = layer;
  const K = bias.length;
  const out = new Float32Array(H * W * K);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * K;
      for (let k = 0; k < K; k++) out[o + k] = bias[k];
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const ib = (yy * W + xx) * C;
          const wb = ((dy + 1) * 3 + (dx + 1)) * C * K;
          for (let c = 0; c < C; c++) {
            const v = input[ib + c];
            if (v === 0) continue;
            const wr = wb + c * K;
            for (let k = 0; k < K; k++) out[o + k] += v * w[wr + k];
          }
        }
      }
      for (let k = 0; k < K; k++) if (out[o + k] < 0) out[o + k] = 0; // relu
    }
  }
  return out;
}

function maxpool(input, H, W, C) {
  const h = H >> 1, wd = W >> 1;
  const out = new Float32Array(h * wd * C);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < wd; x++) {
      for (let c = 0; c < C; c++) {
        const a = input[((2 * y) * W + 2 * x) * C + c];
        const b = input[((2 * y) * W + 2 * x + 1) * C + c];
        const d = input[((2 * y + 1) * W + 2 * x) * C + c];
        const e = input[((2 * y + 1) * W + 2 * x + 1) * C + c];
        out[(y * wd + x) * C + c] = Math.max(a, b, d, e);
      }
    }
  }
  return out;
}

function dense(input, layer, act) {
  const { w, bias } = layer;
  const K = bias.length;
  const N = input.length;
  const out = new Float32Array(bias);
  for (let i = 0; i < N; i++) {
    const v = input[i];
    if (v === 0) continue;
    const r = i * K;
    for (let k = 0; k < K; k++) out[k] += v * w[r + k];
  }
  if (act === 'tanh') for (let k = 0; k < K; k++) out[k] = Math.tanh(out[k]);
  if (act === 'softmax') {
    let m = -Infinity;
    for (let k = 0; k < K; k++) if (out[k] > m) m = out[k];
    let s = 0;
    for (let k = 0; k < K; k++) { out[k] = Math.exp(out[k] - m); s += out[k]; }
    for (let k = 0; k < K; k++) out[k] /= s;
  }
  return out;
}

export function predict(net, image) {
  const L = net.layers;
  let x = image, H = SIZE, W = SIZE, C = 1;
  x = conv3x3(x, H, W, C, L[0]); C = 16;
  x = conv3x3(x, H, W, C, L[1]);
  x = maxpool(x, H, W, C); H = 14; W = 14;
  x = conv3x3(x, H, W, C, L[2]); C = 32;
  x = conv3x3(x, H, W, C, L[3]);
  x = maxpool(x, H, W, C); H = 7; W = 7;
  x = conv3x3(x, H, W, C, L[4]); C = 64;
  x = conv3x3(x, H, W, C, L[5]);
  x = maxpool(x, H, W, C); // 3 × 3 × 64
  x = dense(x, L[6], 'tanh');
  return dense(x, L[7], 'softmax');
}

// ---------- Drawing → 28 × 28 image ----------
// `opts.crop`: fit the drawing's bounding box to the image (Quick, Draw! style) instead of the
// whole canvas. `opts.width`: line width in output pixels. `opts.binary`: keep only well-covered pixels.

export const RASTER = { crop: true, pad: 2, width: 1.5, binary: false };

export function rasterize(strokes, opts = RASTER) {
  const img = new Float32Array(SIZE * SIZE);
  const segs = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const p of s.points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return img;
  let sx, ox, oy;
  if (opts.crop) {
    const span = Math.max(maxX - minX, maxY - minY, 1e-6);
    sx = (SIZE - 2 * opts.pad) / span;
    ox = (SIZE - (maxX - minX) * sx) / 2 - minX * sx;
    oy = (SIZE - (maxY - minY) * sx) / 2 - minY * sx;
  } else {
    sx = SIZE; ox = 0; oy = 0;
  }
  for (const s of strokes) {
    const pts = s.points.map((p) => [p.x * sx + ox, p.y * sx + oy]);
    if (pts.length === 1) segs.push([pts[0][0], pts[0][1], pts[0][0], pts[0][1]]);
    for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
  }
  const r = opts.width / 2;
  for (const [x0, y0, x1, y1] of segs) {
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    const bx0 = Math.max(0, Math.floor(Math.min(x0, x1) - r - 1)), bx1 = Math.min(SIZE - 1, Math.ceil(Math.max(x0, x1) + r + 1));
    const by0 = Math.max(0, Math.floor(Math.min(y0, y1) - r - 1)), by1 = Math.min(SIZE - 1, Math.ceil(Math.max(y0, y1) + r + 1));
    for (let py = by0; py <= by1; py++) {
      for (let px = bx0; px <= bx1; px++) {
        const cx = px + 0.5, cy = py + 0.5;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / len2)) : 0;
        const d = Math.hypot(cx - (x0 + t * dx), cy - (y0 + t * dy));
        const cov = Math.max(0, Math.min(1, r + 0.5 - d));
        const i = py * SIZE + px;
        if (cov > img[i]) img[i] = cov;
      }
    }
  }
  if (opts.binary) for (let i = 0; i < img.length; i++) img[i] = img[i] >= 0.99 ? 1 : 0;
  return img;
}

// Top guesses, as [{ name, p }].
export function classify(net, strokes, k = 5, opts = RASTER) {
  const probs = predict(net, rasterize(strokes, opts));
  const idx = Array.from(probs.keys()).sort((a, b) => probs[b] - probs[a]).slice(0, k);
  return idx.map((i) => ({ name: net.classes[i], p: probs[i] }));
}

// Loads the model once (browser or worker). In Node, read the file and call parseNet instead.
let loading = null;
export function loadNet(url = new URL('../models/sketchnet.bin', import.meta.url)) {
  if (!loading) {
    loading = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Sketch model ${r.status}`);
      return r.arrayBuffer();
    }).then(parseNet).catch((err) => { loading = null; throw err; });
  }
  return loading;
}
