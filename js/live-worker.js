// Linework — live pairing in a background thread, so drawing never stutters.
// Receives the catalog once, then drawings; replies with the record the lines point to right now.
// Uses exactly the same steps as the result screen (pack → unpack → analyse with the sketch recognizer → match).

import { analyze } from './analyze.js';
import { matchRelease } from './catalog.js';
import { encodeDrawing, decodeDrawing } from './share.js';
import { loadNet } from './sketchnet.js';

let catalog = null;
let net = null;
const netReady = loadNet().then((n) => { net = n; }).catch(() => {});
const withNet = (ms) => Promise.race([netReady, new Promise((res) => setTimeout(res, ms))]);

self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === 'catalog') { catalog = msg.catalog; return; }
  // The full reading for the result screen (strokes already packed and unpacked by the page).
  if (msg.type === 'analyze') {
    try {
      if (!net) await withNet(4000);
      self.postMessage({ type: 'analysis', id: msg.id, analysis: analyze(msg.strokes, { net }) });
    } catch (err) {
      self.postMessage({ type: 'analysis', id: msg.id, error: String(err?.message || err) });
    }
    return;
  }
  if (msg.type !== 'match' || !catalog) return;
  try {
    const code = encodeDrawing(msg.strokes);
    const a = analyze(code ? decodeDrawing(code) : msg.strokes, { net });
    const r = matchRelease(a, catalog);
    self.postMessage({
      type: 'match', id: msg.id, motif: a.motif, motifLabel: a.motifLabel,
      release: r && { id: r.id, name: r.name, artists: r.artists, year: r.year, image: r.image },
    });
  } catch (err) {
    self.postMessage({ type: 'match', id: msg.id, error: String(err?.message || err) });
  }
};
