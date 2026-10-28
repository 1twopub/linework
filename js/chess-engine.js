// Linework Chess — the computer opponent. A small alpha-beta search (iterative deepening,
// capture search, move ordering) with material and piece-square scoring. Built on chess.js,
// so it plays by exactly the same rules as the board. Runs in chess-engine-worker.js.

import { legalMoves, makeMove, inCheck, toFen, uciOf, fromFen } from './chess.js';

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;

// Piece-square tables (from White's side, a8 first, as usually printed). Bonuses in centipawns.
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  kEnd: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};
// Square s (a1 = 0) → table index for White (a8 first) and for Black (mirrored).
const idxW = (s) => (7 - (s >> 3)) * 8 + (s & 7);
const idxB = (s) => s;

// Score from the side to move's point of view.
export function evaluate(pos) {
  const board = pos.board;
  let score = 0, nonPawn = 0, bw = 0, bb = 0;
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p) continue;
    const k = p.toLowerCase();
    if (k !== 'p' && k !== 'k') nonPawn += VALUE[k];
  }
  const endgame = nonPawn <= 1300;
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p) continue;
    const k = p.toLowerCase();
    const white = p !== k;
    const table = k === 'k' && endgame ? PST.kEnd : PST[k];
    const v = VALUE[k] + table[white ? idxW(s) : idxB(s)];
    score += white ? v : -v;
    if (k === 'b') { if (white) bw++; else bb++; }
  }
  if (bw >= 2) score += 30;
  if (bb >= 2) score -= 30;
  return pos.turn === 'w' ? score : -score;
}

function orderMoves(moves, best) {
  const key = (m) => {
    if (best && m.from === best.from && m.to === best.to && m.promotion === best.promotion) return -1e6;
    let k = 0;
    if (m.captured) k -= 10 * VALUE[m.captured.toLowerCase()] - VALUE[m.piece.toLowerCase()];
    if (m.promotion) k -= VALUE[m.promotion] + 800;
    return k;
  };
  return moves.map((m) => [key(m), m]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

class Timeout extends Error {}

export class Searcher {
  // `exact`: score every root move fully (the easier levels choose among near-best moves);
  // otherwise only the best move's score is exact, which lets the search go deeper.
  constructor({ timeMs = 1000, maxDepth = 4, history = [], exact = true } = {}) {
    this.exact = exact;
    this.deadline = 0;
    this.timeMs = timeMs;
    this.maxDepth = maxDepth;
    this.nodes = 0;
    this.history = new Set(history); // positions already seen in the game (to avoid repeating into draws)
  }

  tick() {
    if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new Timeout();
  }

  quiesce(pos, alpha, beta, depth) {
    this.tick();
    const stand = evaluate(pos);
    if (stand >= beta) return beta;
    if (alpha < stand) alpha = stand;
    if (depth <= 0) return alpha;
    const caps = orderMoves(legalMoves(pos).filter((m) => m.captured || m.promotion));
    for (const m of caps) {
      const score = -this.quiesce(makeMove(pos, m), -beta, -alpha, depth - 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  search(pos, depth, alpha, beta, ply, path) {
    this.tick();
    const key = toFen(pos, { counters: false });
    if (ply > 0 && (path.has(key) || this.history.has(key))) return 0; // repetition: a draw
    if (pos.half >= 100) return 0;
    const moves = legalMoves(pos);
    if (!moves.length) return inCheck(pos) ? -MATE + ply : 0;
    if (depth <= 0) return this.quiesce(pos, alpha, beta, 4);
    path.add(key);
    let best = -Infinity;
    for (const m of orderMoves(moves, ply === 0 ? this.rootBest : null)) {
      const score = -this.search(makeMove(pos, m), depth - 1, -beta, -alpha, ply + 1, path);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    path.delete(key);
    return best;
  }

  // Scores every root move at increasing depth until time runs out. Returns [{ move, score }] best first.
  rootScores(pos) {
    this.deadline = Date.now() + this.timeMs;
    let moves = legalMoves(pos);
    let scored = moves.map((m) => ({ move: m, score: 0 }));
    for (let depth = 1; depth <= this.maxDepth; depth++) {
      const next = [];
      try {
        let alpha = -MATE - 1;
        for (const { move } of scored) {
          const lo = this.exact ? -MATE - 1 : alpha;
          let score = -this.search(makeMove(pos, move), depth - 1, -MATE - 1, -lo, 1, new Set([toFen(pos, { counters: false })]));
          // Pruned search: a move that only proved "no better" is an upper bound; rank it below the best.
          if (!this.exact && next.length && score <= lo) score = lo - 1;
          next.push({ move, score });
          if (score > alpha) alpha = score;
        }
      } catch (e) {
        if (e instanceof Timeout) break;
        throw e;
      }
      scored = next.sort((a, b) => b.score - a.score);
      this.rootBest = scored[0]?.move;
      this.depth = depth;
      if (Math.abs(scored[0].score) > MATE - 100) break; // found a mate
    }
    return scored;
  }
}

// ---------- Levels ----------
// easy: looks one move ahead and often settles for something reasonable;
// medium: a few moves ahead with a little variety; hard: as deep as ~1.5 s allows.
export const LEVELS = {
  easy: { label: 'Easy', timeMs: 300, maxDepth: 1, slack: 180, blunder: 0.22 },
  medium: { label: 'Medium', timeMs: 800, maxDepth: 3, slack: 35, blunder: 0.03 },
  hard: { label: 'Hard', timeMs: 1500, maxDepth: 6, slack: 0, blunder: 0 },
};

// Picks the computer's move. `history`: FENs (without counters) seen so far in the game.
export function chooseMove(fen, level = 'medium', history = [], rand = Math.random) {
  const L = LEVELS[level] || LEVELS.medium;
  const pos = fromFen(fen);
  const s = new Searcher({ timeMs: L.timeMs, maxDepth: L.maxDepth, history, exact: L.slack > 0 || L.blunder > 0 });
  const scored = s.rootScores(pos);
  if (!scored.length) return null;
  const best = scored[0].score;
  let pick = scored[0];
  if (!s.exact) {
    // Hard: only the best move's score is exact, so it plays that.
  } else if (L.blunder && rand() < L.blunder) {
    // A human-like slip: any move that doesn't simply hang a big piece.
    const ok = scored.filter((x) => x.score > best - 350);
    pick = ok[Math.floor(rand() * ok.length)] || pick;
  } else {
    const slack = L.slack + (pos.full <= 4 ? 25 : 0); // a little variety in the opening at every level
    const near = scored.filter((x) => x.score >= best - slack);
    pick = near[Math.floor(rand() * near.length)] || pick;
  }
  return { uci: uciOf(pick.move), score: pick.score, best, depth: s.depth, nodes: s.nodes };
}

// Would the computer take a draw? Yes if it's worse off, or the game is long and level.
export function acceptsDraw(fen, level = 'medium', cpu = 'b') {
  const pos = fromFen(fen);
  const s = new Searcher({ timeMs: 400, maxDepth: 2 });
  let score = s.rootScores(pos)[0]?.score ?? 0; // from the side to move…
  if (pos.turn !== cpu) score = -score; // …turned to the computer's side
  if (level === 'easy') return score < 50;
  return score < -60 || (pos.full > 40 && Math.abs(score) < 40);
}
