// Linework — live pairing in a background thread, so drawing never stutters.
// Receives the catalog once, then drawings; replies with the record the lines point to right now.
// Uses exactly the same steps as the result screen (pack → unpack → analyse → match).

import { analyze } from './analyze.js';
import { matchRelease } from './catalog.js';
import { encodeDrawing, decodeDrawing } from './share.js';

let catalog = null;

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'catalog') { catalog = msg.catalog; return; }
  if (msg.type !== 'match' || !catalog) return;
  try {
    const code = encodeDrawing(msg.strokes);
    const a = analyze(code ? decodeDrawing(code) : msg.strokes);
    const r = matchRelease(a, catalog);
    self.postMessage({
      type: 'match', id: msg.id, motif: a.motif, motifLabel: a.motifLabel,
      release: r && { id: r.id, name: r.name, artists: r.artists, year: r.year, image: r.image },
    });
  } catch (err) {
    self.postMessage({ type: 'match', id: msg.id, error: String(err?.message || err) });
  }
};
