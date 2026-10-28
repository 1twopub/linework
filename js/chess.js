// Linework Chess — the rules. Plain JavaScript, no dependencies; used by the page, the room
// server (Cloudflare) and the feed builder, so every one of them agrees on what is legal.
//
// Squares are 0..63: a1 = 0, b1 = 1, … h8 = 63 (index = rank * 8 + file).
// Pieces are letters: white uppercase (PNBRQK), black lowercase.

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';

export const sqName = (s) => FILES[s & 7] + ((s >> 3) + 1);
export const sqIndex = (n) => (n.charCodeAt(1) - 49) * 8 + (n.charCodeAt(0) - 97);
export const colorOf = (p) => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);
const fileOf = (s) => s & 7;
const rankOf = (s) => s >> 3;

// ---------- Positions ----------

export function fromFen(fen = START_FEN) {
  const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board = new Array(64).fill(null);
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error('Bad FEN');
  rows.forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else board[(7 - i) * 8 + f++] = ch;
    }
  });
  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: castling && castling !== '-' ? castling : '',
    ep: ep && ep !== '-' ? sqIndex(ep) : null,
    half: Number(half) || 0,
    full: Number(full) || 1,
  };
}

export function toFen(pos, { counters = true } = {}) {
  let out = '';
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = pos.board[r * 8 + f];
      if (!p) { empty++; continue; }
      if (empty) { out += empty; empty = 0; }
      out += p;
    }
    if (empty) out += empty;
    if (r) out += '/';
  }
  const parts = [out, pos.turn, pos.castling || '-', pos.ep === null ? '-' : sqName(pos.ep)];
  if (counters) parts.push(pos.half, pos.full);
  return parts.join(' ');
}

// ---------- Attacks ----------

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function step(s, df, dr) {
  const f = fileOf(s) + df, r = rankOf(s) + dr;
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f;
}

// Is square `s` attacked by side `by`?
export function attacked(board, s, by) {
  const up = by === 'w' ? -1 : 1; // pawns attack from the rank behind the square
  const pawn = by === 'w' ? 'P' : 'p';
  for (const df of [-1, 1]) { const t = step(s, df, up); if (t >= 0 && board[t] === pawn) return true; }
  const knight = by === 'w' ? 'N' : 'n';
  for (const [df, dr] of KNIGHT) { const t = step(s, df, dr); if (t >= 0 && board[t] === knight) return true; }
  const king = by === 'w' ? 'K' : 'k';
  for (const [df, dr] of KING) { const t = step(s, df, dr); if (t >= 0 && board[t] === king) return true; }
  const [rook, bishop, queen] = by === 'w' ? ['R', 'B', 'Q'] : ['r', 'b', 'q'];
  for (const [df, dr] of ROOK_DIRS) {
    for (let t = step(s, df, dr); t >= 0; t = step(t, df, dr)) {
      const p = board[t];
      if (p) { if (p === rook || p === queen) return true; break; }
    }
  }
  for (const [df, dr] of BISHOP_DIRS) {
    for (let t = step(s, df, dr); t >= 0; t = step(t, df, dr)) {
      const p = board[t];
      if (p) { if (p === bishop || p === queen) return true; break; }
    }
  }
  return false;
}

export function kingSquare(board, color) {
  const k = color === 'w' ? 'K' : 'k';
  return board.indexOf(k);
}

export function inCheck(pos, color = pos.turn) {
  const k = kingSquare(pos.board, color);
  return k >= 0 && attacked(pos.board, k, color === 'w' ? 'b' : 'w');
}

// ---------- Moves ----------
// A move: { from, to, piece, captured, promotion, castle: 'K'|'Q', ep, double }

function pseudoMoves(pos) {
  const { board, turn } = pos;
  const them = turn === 'w' ? 'b' : 'w';
  const out = [];
  const add = (from, to, extra = {}) => out.push({ from, to, piece: board[from], captured: board[to] || null, ...extra });
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p || colorOf(p) !== turn) continue;
    const kind = p.toLowerCase();
    if (kind === 'p') {
      const dir = turn === 'w' ? 1 : -1;
      const startRank = turn === 'w' ? 1 : 6;
      const lastRank = turn === 'w' ? 7 : 0;
      const one = step(s, 0, dir);
      const pushPromo = (from, to, extra = {}) => {
        if (rankOf(to) === lastRank) for (const pr of 'qrbn') add(from, to, { ...extra, promotion: pr });
        else add(from, to, extra);
      };
      if (one >= 0 && !board[one]) {
        pushPromo(s, one);
        const two = step(s, 0, 2 * dir);
        if (rankOf(s) === startRank && !board[two]) add(s, two, { double: true });
      }
      for (const df of [-1, 1]) {
        const t = step(s, df, dir);
        if (t < 0) continue;
        if (board[t] && colorOf(board[t]) === them) pushPromo(s, t);
        else if (t === pos.ep) add(s, t, { ep: true, captured: turn === 'w' ? 'p' : 'P' });
      }
    } else if (kind === 'n' || kind === 'k') {
      for (const [df, dr] of kind === 'n' ? KNIGHT : KING) {
        const t = step(s, df, dr);
        if (t >= 0 && colorOf(board[t]) !== turn) add(s, t);
      }
      if (kind === 'k') {
        const home = turn === 'w' ? 4 : 60;
        if (s === home && !attacked(board, s, them)) {
          const [kSide, qSide] = turn === 'w' ? ['K', 'Q'] : ['k', 'q'];
          const rook = turn === 'w' ? 'R' : 'r';
          if (pos.castling.includes(kSide) && !board[s + 1] && !board[s + 2] && board[s + 3] === rook
            && !attacked(board, s + 1, them) && !attacked(board, s + 2, them)) add(s, s + 2, { castle: 'K' });
          if (pos.castling.includes(qSide) && !board[s - 1] && !board[s - 2] && !board[s - 3] && board[s - 4] === rook
            && !attacked(board, s - 1, them) && !attacked(board, s - 2, them)) add(s, s - 2, { castle: 'Q' });
        }
      }
    } else {
      const dirs = kind === 'r' ? ROOK_DIRS : kind === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [df, dr] of dirs) {
        for (let t = step(s, df, dr); t >= 0; t = step(t, df, dr)) {
          if (!board[t]) { add(s, t); continue; }
          if (colorOf(board[t]) === them) add(s, t);
          break;
        }
      }
    }
  }
  return out;
}

export function makeMove(pos, m) {
  const board = pos.board.slice();
  const turn = pos.turn;
  board[m.to] = m.promotion ? (turn === 'w' ? m.promotion.toUpperCase() : m.promotion) : board[m.from];
  board[m.from] = null;
  if (m.ep) board[m.to + (turn === 'w' ? -8 : 8)] = null;
  if (m.castle === 'K') { board[m.from + 1] = board[m.from + 3]; board[m.from + 3] = null; }
  if (m.castle === 'Q') { board[m.from - 1] = board[m.from - 4]; board[m.from - 4] = null; }
  let castling = pos.castling;
  const strip = (chars) => { for (const c of chars) castling = castling.replace(c, ''); };
  if (m.piece === 'K') strip('KQ');
  if (m.piece === 'k') strip('kq');
  for (const s of [m.from, m.to]) {
    if (s === 0) strip('Q');
    if (s === 7) strip('K');
    if (s === 56) strip('q');
    if (s === 63) strip('k');
  }
  const pawn = m.piece === 'P' || m.piece === 'p';
  return {
    board,
    turn: turn === 'w' ? 'b' : 'w',
    castling,
    ep: m.double ? (m.from + m.to) / 2 : null,
    half: pawn || m.captured ? 0 : pos.half + 1,
    full: pos.full + (turn === 'b' ? 1 : 0),
  };
}

export function legalMoves(pos) {
  return pseudoMoves(pos).filter((m) => !inCheck(makeMove(pos, m), pos.turn));
}

export const uciOf = (m) => sqName(m.from) + sqName(m.to) + (m.promotion || '');

export function moveFromUci(pos, uci) {
  if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4)), promo = uci[4] || undefined;
  return legalMoves(pos).find((m) => m.from === from && m.to === to && (m.promotion || undefined) === promo) || null;
}

// Standard algebraic notation (Nf3, exd5, O-O, e8=Q+, Qxf7#).
export function san(pos, m, legal = legalMoves(pos)) {
  let s;
  if (m.castle) s = m.castle === 'K' ? 'O-O' : 'O-O-O';
  else {
    const kind = m.piece.toUpperCase();
    const capture = !!m.captured;
    if (kind === 'P') {
      s = (capture ? FILES[fileOf(m.from)] + 'x' : '') + sqName(m.to) + (m.promotion ? `=${m.promotion.toUpperCase()}` : '');
    } else {
      const rivals = legal.filter((o) => o !== m && o.piece === m.piece && o.to === m.to && o.from !== m.from);
      let dis = '';
      if (rivals.length) {
        const sameFile = rivals.some((o) => fileOf(o.from) === fileOf(m.from));
        const sameRank = rivals.some((o) => rankOf(o.from) === rankOf(m.from));
        if (!sameFile) dis = FILES[fileOf(m.from)];
        else if (!sameRank) dis = String(rankOf(m.from) + 1);
        else dis = sqName(m.from);
      }
      s = kind + dis + (capture ? 'x' : '') + sqName(m.to);
    }
  }
  const next = makeMove(pos, m);
  if (inCheck(next)) s += legalMoves(next).length ? '+' : '#';
  return s;
}

// ---------- Endings ----------

export function insufficientMaterial(board) {
  const pieces = board.map((p, s) => (p ? { p, s } : null)).filter(Boolean).filter((x) => x.p.toLowerCase() !== 'k');
  if (!pieces.length) return true;
  if (pieces.some((x) => 'pqr'.includes(x.p.toLowerCase()))) return false;
  if (pieces.length === 1) return true; // a lone minor piece
  // Bishops only, all on one colour of square.
  if (pieces.every((x) => x.p.toLowerCase() === 'b')) {
    const shade = (s) => (fileOf(s) + rankOf(s)) & 1;
    return pieces.every((x) => shade(x.s) === shade(pieces[0].s));
  }
  return false;
}

// ---------- A whole game ----------

export class Game {
  constructor(moves = []) {
    this.pos = fromFen();
    this.history = []; // [{ uci, san, move, before }]
    this.seen = new Map([[toFen(this.pos, { counters: false }), 1]]);
    for (const u of moves) if (!this.play(u)) throw new Error(`Illegal move ${u}`);
  }

  get moves() { return this.history.map((h) => h.uci); }
  get turn() { return this.pos.turn; }
  legal() { return legalMoves(this.pos); }

  // Plays a move given in UCI (e2e4, e7e8q). Returns its SAN, or null if it isn't legal.
  play(uci) {
    if (this.status().over) return null;
    const legal = legalMoves(this.pos);
    const m = moveFromUci(this.pos, uci);
    if (!m) return null;
    const sanText = san(this.pos, m, legal);
    const before = this.pos;
    this.pos = makeMove(this.pos, m);
    const key = toFen(this.pos, { counters: false });
    this.seen.set(key, (this.seen.get(key) || 0) + 1);
    this.history.push({ uci: uciOf(m), san: sanText, move: m, before });
    return sanText;
  }

  // { over, result: '1-0' | '0-1' | '1/2-1/2' | null, reason, check }
  status() {
    const check = inCheck(this.pos);
    const any = legalMoves(this.pos).length > 0;
    if (!any && check) return { over: true, result: this.pos.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate', check };
    if (!any) return { over: true, result: '1/2-1/2', reason: 'stalemate', check };
    if (insufficientMaterial(this.pos.board)) return { over: true, result: '1/2-1/2', reason: 'insufficient', check };
    if (this.pos.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty', check };
    if ((this.seen.get(toFen(this.pos, { counters: false })) || 0) >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold', check };
    return { over: false, result: null, reason: null, check };
  }
}

// ---------- Compact game codes (for links and the feed) ----------
// "LWC1." + one byte per move: from (6 bits) and to (6 bits) packed with a 2-bit promotion code
// into 14 bits → stored as 2 bytes, base64url. Ending a game early (resign / agreed draw) is
// recorded by a trailing marker byte pair.

const PROMO = ['', 'q', 'r', 'b', 'n'];
export const END_MARKS = { resign_w: 0xfff0, resign_b: 0xfff1, draw: 0xfff2 };

export function encodeGame(moves, end = null) {
  const bytes = [];
  for (const u of moves) {
    const from = sqIndex(u.slice(0, 2)), to = sqIndex(u.slice(2, 4));
    const pr = Math.max(0, PROMO.indexOf(u[4] || ''));
    const v = (from << 9) | (to << 3) | pr; // 15 bits
    bytes.push(v >> 8, v & 255);
  }
  if (end && END_MARKS[end] !== undefined) bytes.push(END_MARKS[end] >> 8, END_MARKS[end] & 255);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return `LWC1.${b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function decodeGame(code) {
  if (typeof code !== 'string' || !/^LWC1\.[A-Za-z0-9_-]*$/.test(code)) throw new Error('Not a game code');
  const b64 = code.slice(5).replace(/-/g, '+').replace(/_/g, '/');
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  if (bin.length % 2) throw new Error('Bad game code');
  const moves = [];
  let end = null;
  for (let i = 0; i < bin.length; i += 2) {
    const v = (bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1);
    const mark = Object.entries(END_MARKS).find(([, x]) => x === v);
    if (mark) { end = mark[0]; break; }
    moves.push(sqName(v >> 9) + sqName((v >> 3) & 63) + PROMO[v & 7]);
  }
  return { moves, end };
}

export const MAX_MOVES = 600; // longer games aren't accepted (the 50-move rule makes them very unlikely)
