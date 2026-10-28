// Linework Chess — runs the computer opponent off the main thread, so the board never freezes.
import { chooseMove, acceptsDraw } from './chess-engine.js';

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.t === 'move') {
      const started = Date.now();
      const r = chooseMove(m.fen, m.level, m.history || []);
      self.postMessage({ t: 'move', id: m.id, ...r, ms: Date.now() - started });
    } else if (m.t === 'draw') {
      self.postMessage({ t: 'draw', id: m.id, accept: acceptsDraw(m.fen, m.level, m.cpu) });
    }
  } catch (err) {
    self.postMessage({ t: 'error', id: m.id, message: String(err?.message || err) });
  }
};
