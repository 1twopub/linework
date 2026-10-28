// Linework Chess — reads a chess position the way analyze.js reads a drawing: seven linework
// dimensions (so genre matching works unchanged) and a motif (so titles match unchanged).
//
// The motif comes from, in order: how the game ended, what just happened (a promotion, castling,
// check), the opening being played, or the piece that dominates the board.

import { Game, legalMoves, inCheck, attacked, colorOf } from './chess.js';
import { DIMS, MOTIF_LABELS } from './analyze.js';

export const CHESS_DIM_LABELS = {
  energy: 'Tension', angularity: 'Diagonals', curvature: 'Leaps', density: 'Crowd',
  chaos: 'Chaos', height: 'Advance', symmetry: 'Symmetry',
};
const TRAITS = {
  energy: ['quiet', 'tense'], angularity: ['straight-lined', 'diagonal'], curvature: ['steady', 'leaping'],
  density: ['open', 'crowded'], chaos: ['balanced', 'wild'], height: ['guarded', 'advanced'], symmetry: ['lopsided', 'mirrored'],
};

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// ---------- Openings ----------
// Matched on the exact move order (longest match wins). Each points to a motif whose titles fit.
const OPENINGS = [
  ['e2e4', "King's Pawn Opening", 'crown'],
  ['d2d4', "Queen's Pawn Opening", 'crown'],
  ['c2c4', 'The English Opening', 'cup'],
  ['g1f3', 'The Réti Opening', 'arrow'],
  ['f2f4', "Bird's Opening", 'bird'],
  ['b2b4', 'The Orangutan', 'monkey'],
  ['g2g4', "Grob's Attack", 'skull'],
  ['e2e4 c7c5', 'The Sicilian Defence', 'sun'],
  ['e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6', 'The Sicilian Dragon', 'dragon'],
  ['e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6', 'The Najdorf Sicilian', 'star'],
  ['e2e4 c7c5 d2d4 c5d4 c2c3', 'The Smith–Morra Gambit', 'money'],
  ['e2e4 e7e6', 'The French Defence', 'globe'],
  ['e2e4 c7c6', 'The Caro–Kann Defence', 'castle'],
  ['e2e4 d7d5', 'The Scandinavian Defence', 'snow'],
  ['e2e4 g8f6', "Alekhine's Defence", 'horse'],
  ['e2e4 d7d6', 'The Pirc Defence', 'mountain'],
  ['e2e4 g7g6', 'The Modern Defence', 'screen'],
  ['e2e4 b7b6', "Owen's Defence", 'bird'],
  ['e2e4 e7e5', 'The Open Game', 'door'],
  ['e2e4 e7e5 f2f4', "The King's Gambit", 'crown'],
  ['e2e4 e7e5 d2d4 e5d4 c2c3', 'The Danish Gambit', 'sweets'],
  ['e2e4 e7e5 b1c3', 'The Vienna Game', 'violin'],
  ['e2e4 e7e5 g1f3 d7d6', "Philidor's Defence", 'note'],
  ['e2e4 e7e5 g1f3 g8f6', "Petrov's Defence", 'snow'],
  ['e2e4 e7e5 g1f3 b8c6 d2d4', 'The Scotch Game', 'bottle'],
  ['e2e4 e7e5 g1f3 b8c6 f1b5', 'The Ruy López', 'figure'],
  ['e2e4 e7e5 g1f3 b8c6 f1c4', 'The Italian Game', 'piano'],
  ['e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4', 'The Evans Gambit', 'money'],
  ['e2e4 e7e5 g1f3 b8c6 f1c4 g8f6', 'The Two Knights Defence', 'horse'],
  ['e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5 d7d5 e4d5 f6d5 g5f7', 'The Fried Liver Attack', 'food'],
  ['e2e4 e7e5 g1f3 b8c6 b1c3 g8f6', 'The Four Knights Game', 'horse'],
  ['e2e4 e7e5 g1f3 g8f6 f3e5 b8c6', 'The Stafford Gambit', 'money'],
  ['d2d4 d7d5 c2c4', "The Queen's Gambit", 'crown'],
  ['d2d4 d7d5 c2c4 d5c4', "The Queen's Gambit Accepted", 'money'],
  ['d2d4 d7d5 c2c4 e7e6', "The Queen's Gambit Declined", 'castle'],
  ['d2d4 d7d5 c2c4 c7c6', 'The Slav Defence', 'snow'],
  ['d2d4 d7d5 c1f4', 'The London System', 'rain'],
  ['d2d4 d7d5 g1f3 g8f6 c1f4', 'The London System', 'rain'],
  ['d2d4 g8f6 g1f3 d7d5 c1f4', 'The London System', 'rain'],
  ['d2d4 f7f5', 'The Dutch Defence', 'wind'],
  ['d2d4 g8f6 c2c4 g7g6', "The King's Indian Defence", 'crown'],
  ['d2d4 g8f6 c2c4 g7g6 b1c3 d7d5', 'The Grünfeld Defence', 'tree'],
  ['d2d4 g8f6 c2c4 e7e6 b1c3 f8b4', 'The Nimzo-Indian Defence', 'eye'],
  ['d2d4 g8f6 c2c4 e7e6 g2g3', 'The Catalan', 'sun'],
  ['d2d4 g8f6 c2c4 c7c5 d4d5', 'The Benoni Defence', 'wave'],
  ['d2d4 g8f6 c2c4 c7c5 d4d5 b7b5', 'The Benko Gambit', 'money'],
  ['d2d4 g8f6 c2c4 e7e5', 'The Budapest Gambit', 'city'],
  ['c2c4 e7e5', 'The Reversed Sicilian', 'sun'],
].map(([seq, name, motif]) => ({ seq: seq.split(' '), name, motif }));

export function openingOf(moves) {
  let best = null;
  for (const o of OPENINGS) {
    if (o.seq.length > moves.length) continue;
    if (o.seq.every((u, i) => moves[i] === u) && (!best || o.seq.length > best.seq.length)) best = o;
  }
  return best;
}

// ---------- Endings and events ----------

const ENDINGS = {
  checkmate: ['skull', 'Checkmate'],
  resign: ['drop', 'A resignation'],
  draw: ['hand', 'A handshake draw'],
  stalemate: ['box', 'Stalemate'],
  threefold: ['loops', 'Threefold repetition'],
  fifty: ['clock', 'The fifty-move rule'],
  insufficient: ['horizon', 'Bare kings'],
};

const PIECE_MOTIF = {
  n: ['horse', 'Galloping knights', "A knight's tour"],
  b: ['cross', "The bishops' diagonals", "A bishop's diagonal"],
  r: ['castle', 'Rooks on open files', 'A rook on the run'],
  q: ['crown', "The queen's reign", "The queen's reign"],
  k: ['foot', "A king's walk", "A king's walk"],
  p: ['figure', 'A pawn march', 'A pawn march'],
};

// Mobility per piece kind (pseudo-legal reach is enough here, from both sides' point of view).
function mobility(pos) {
  const out = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0, diag: 0, straight: 0, total: 0 };
  for (const turn of ['w', 'b']) {
    const p = { ...pos, turn, ep: turn === pos.turn ? pos.ep : null };
    for (const m of legalMoves(p)) {
      const kind = m.piece.toLowerCase();
      out[kind]++;
      out.total++;
      const df = Math.abs((m.to & 7) - (m.from & 7)), dr = Math.abs((m.to >> 3) - (m.from >> 3));
      if (kind !== 'n' && df && dr) out.diag++;
      else if (kind !== 'n') out.straight++;
    }
  }
  return out;
}

function pawnChains(board) {
  // Longest run of pawns of one colour each defended by the previous one (a staircase).
  let best = 0;
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p || p.toLowerCase() !== 'p') continue;
    const dir = p === 'P' ? 1 : -1;
    for (const df of [-1, 1]) {
      let len = 1, t = s;
      for (;;) {
        const f = (t & 7) + df, r = (t >> 3) + dir;
        if (f < 0 || f > 7 || r < 0 || r > 7 || board[r * 8 + f] !== p) break;
        t = r * 8 + f; len++;
      }
      best = Math.max(best, len);
    }
  }
  return best;
}

function hashMoves(moves, end) {
  let h = 2166136261;
  for (const ch of `${moves.join(' ')}|${end || ''}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// `moves`: UCI list. `end`: null, 'resign_w' | 'resign_b' (who resigned), or 'draw' (agreed).
export function analyzeGame(moves, end = null) {
  const game = new Game(moves);
  const pos = game.pos;
  const board = pos.board;
  const status = game.status();
  const ply = moves.length;
  const recent = game.history.slice(-6);

  // ---- Features ----
  const pieces = board.filter(Boolean);
  const mob = mobility(pos);
  const material = { w: 0, b: 0 };
  let advance = 0, counted = 0, mirrored = 0, colorMirror = 0, hanging = 0;
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p) continue;
    const c = colorOf(p), kind = p.toLowerCase(), r = s >> 3, f = s & 7;
    material[c] += VALUE[kind];
    if (kind !== 'k') { advance += c === 'w' ? r / 7 : (7 - r) / 7; counted++; }
    if (board[r * 8 + (7 - f)] === p) mirrored++;
    const twin = board[(7 - r) * 8 + f];
    if (twin && twin.toLowerCase() === kind && colorOf(twin) !== c) colorMirror++;
    const them = c === 'w' ? 'b' : 'w';
    if (kind !== 'k' && attacked(board, s, them) && !attacked(board, s, c)) hanging++;
  }
  const captures = recent.filter((h) => h.move.captured).length;
  const checks = recent.filter((h) => /[+#]/.test(h.san)).length;
  const imbalance = Math.abs(material.w - material.b);
  const features = {
    energy: clamp(0.12 + 0.1 * captures + 0.14 * checks + 0.06 * hanging + (status.check ? 0.15 : 0)),
    angularity: clamp(mob.total ? (mob.diag / Math.max(1, mob.diag + mob.straight)) * 1.3 : 0.5),
    curvature: clamp(mob.total ? (mob.n / mob.total) * 3.5 : 0.3),
    density: clamp(pieces.length / 32),
    chaos: clamp(0.1 + imbalance / 12 + 0.08 * hanging + 0.12 * checks + (status.over ? 0.15 : 0)),
    height: clamp(counted ? (advance / counted - 0.04) / 0.42 : 0.5),
    symmetry: clamp(pieces.length ? (0.5 * mirrored + 0.5 * colorMirror) / pieces.length : 0.5),
  };

  // ---- Motif ----
  let motif = null, label = null, opening = null;
  const endReason = end ? (end === 'draw' ? 'draw' : 'resign') : status.over ? status.reason : null;
  if (endReason) [motif, label] = ENDINGS[endReason];
  const last = game.history[game.history.length - 1];
  if (!motif && last) {
    if (last.move.promotion) {
      [motif, label] = last.move.promotion === 'n' ? ['horse', 'A knight is born'] : ['crown', last.move.promotion === 'q' ? 'A new queen' : 'A promotion'];
    } else if (last.move.castle) [motif, label] = ['castle', last.move.castle === 'K' ? 'Castling short' : 'Castling long'];
    else if (status.check) [motif, label] = ['lightning', 'Check'];
    else if (last.move.captured && last.move.captured.toLowerCase() === 'q') [motif, label] = ['diamond', 'The queen falls'];
  }
  if (!motif && ply <= 20) {
    opening = openingOf(moves);
    if (opening && (ply <= opening.seq.length + 6)) [motif, label] = [opening.motif, opening.name];
  }
  if (!motif) {
    if (pawnChains(board) >= 4) [motif, label] = ['stairs', 'A pawn chain'];
    else {
      // The piece kind doing the most on the board, by reach weighted a little by value.
      const kinds = ['n', 'b', 'r', 'q', 'k', 'p'].filter((k) => pieces.some((p) => p.toLowerCase() === k));
      const weight = { n: 1.25, b: 1, r: 1, q: 0.75, k: pieces.length <= 8 ? 0.8 : 0.15, p: 1.1 };
      const top = kinds.sort((a, b) => mob[b] * weight[b] - mob[a] * weight[a])[0] || 'k';
      const many = pieces.filter((p) => p.toLowerCase() === top).length > 1;
      [motif, label] = [PIECE_MOTIF[top][0], PIECE_MOTIF[top][many ? 1 : 2]];
    }
  }
  if (!MOTIF_LABELS[motif]) motif = 'abstract';

  const traits = DIMS
    .map((d) => ({ d, v: features[d], w: Math.abs(features[d] - 0.5) }))
    .filter((x) => x.v > 0.62 || x.v < 0.3)
    .sort((a, b) => b.w - a.w)
    .slice(0, 3)
    .map((x) => TRAITS[x.d][x.v > 0.5 ? 1 : 0]);

  return {
    features, motif, motifLabel: label || MOTIF_LABELS[motif], traits,
    hash: hashMoves(moves, end),
    stats: { ply, status, end, opening: opening?.name || null, material },
  };
}
