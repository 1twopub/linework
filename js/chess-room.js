// Linework Chess — one game room's rules: seats, turns, moves, resign / draw / rematch.
// Platform-neutral: the Cloudflare Durable Object (chess-worker/) wraps it, and so can a test server.
//
// Messages from a player (JSON):
//   { t: 'move', uci, ply }        ply = how many moves the player had seen (stops double moves)
//   { t: 'resign' } { t: 'draw' }  draw offers, or accepts an offer from the other side
//   { t: 'decline' } { t: 'rematch' }
// The room answers with a fresh `snapshot()` for everyone, or an error for the sender.

import { Game, MAX_MOVES } from './chess.js';

const SEATS = ['w', 'b'];
const other = (c) => (c === 'w' ? 'b' : 'w');

export function newToken() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class RoomCore {
  // `data` is whatever `toJSON()` returned earlier (from storage), or undefined for a new room.
  constructor(data) {
    const d = data || {};
    this.seats = d.seats || { w: null, b: null }; // seat → secret token
    this.moves = Array.isArray(d.moves) ? d.moves : [];
    this.end = d.end || null; // null | 'resign_w' | 'resign_b' | 'draw'
    this.offer = d.offer || null; // colour offering a draw
    this.rematch = d.rematch || { w: false, b: false };
    this.round = d.round || 1;
    this.game = new Game(this.moves);
  }

  toJSON() {
    return { seats: this.seats, moves: this.moves, end: this.end, offer: this.offer, rematch: this.rematch, round: this.round };
  }

  // A player arrives. `token` reclaims a seat after a reconnect; `want` is the preferred colour.
  // Returns { color: 'w' | 'b' | null (watching), token }.
  join({ token, want } = {}) {
    for (const c of SEATS) if (token && this.seats[c] === token) return { color: c, token };
    const order = want === 'b' ? ['b', 'w'] : ['w', 'b'];
    for (const c of order) {
      if (!this.seats[c]) {
        const t = newToken();
        this.seats[c] = t;
        return { color: c, token: t, changed: true };
      }
    }
    return { color: null, token: null };
  }

  over() {
    return !!this.end || this.game.status().over;
  }

  // Applies a message from the player sitting at `color`. Returns { changed, error }.
  handle(color, msg) {
    if (!SEATS.includes(color)) return { error: 'You are watching this game.' };
    if (!msg || typeof msg !== 'object') return { error: 'Bad message.' };
    switch (msg.t) {
      case 'move': {
        if (this.over()) return { error: 'The game is over.' };
        if (this.game.turn !== color) return { error: 'Not your turn.' };
        if (msg.ply !== this.moves.length) return { error: 'Out of date: the board has changed.' };
        if (this.moves.length >= MAX_MOVES) return { error: 'This game is too long.' };
        if (!this.game.play(msg.uci)) return { error: 'Illegal move.' };
        this.moves.push(this.game.moves[this.game.moves.length - 1]);
        if (this.offer && this.offer !== color) this.offer = null; // moving declines an offer
        return { changed: true };
      }
      case 'resign':
        if (this.over()) return { error: 'The game is over.' };
        this.end = color === 'w' ? 'resign_w' : 'resign_b';
        this.offer = null;
        return { changed: true };
      case 'draw':
        if (this.over()) return { error: 'The game is over.' };
        if (this.offer === other(color)) { this.end = 'draw'; this.offer = null; return { changed: true }; }
        if (this.offer === color) return {};
        this.offer = color;
        return { changed: true };
      case 'decline':
        if (this.offer !== other(color)) return {};
        this.offer = null;
        return { changed: true };
      case 'rematch': {
        if (!this.over()) return { error: 'Finish this game first.' };
        this.rematch[color] = true;
        if (this.rematch.w && this.rematch.b) {
          // Swap colours and start again.
          this.seats = { w: this.seats.b, b: this.seats.w };
          this.moves = [];
          this.end = null;
          this.offer = null;
          this.rematch = { w: false, b: false };
          this.round++;
          this.game = new Game();
          return { changed: true, swapped: true };
        }
        return { changed: true };
      }
      default:
        return { error: 'Unknown message.' };
    }
  }

  // What everyone sees. `online` = { w: bool, b: bool }.
  snapshot(online = { w: false, b: false }) {
    const status = this.game.status();
    let result = status.result, reason = status.reason;
    if (this.end === 'draw') { result = '1/2-1/2'; reason = 'draw'; }
    if (this.end === 'resign_w') { result = '0-1'; reason = 'resign'; }
    if (this.end === 'resign_b') { result = '1-0'; reason = 'resign'; }
    return {
      t: 'state',
      moves: this.moves,
      end: this.end,
      over: this.over(),
      result,
      reason,
      offer: this.offer,
      rematch: this.rematch,
      round: this.round,
      seated: { w: !!this.seats.w, b: !!this.seats.b },
      online,
    };
  }
}
