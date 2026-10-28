// Linework Chess — pieces and board pictures. Line-drawn pieces in Linework's ink, as SVG.
// Used by the live board (chess-app.js), the post sheet, and the feed's thumbnails.

const INK = '#141311';
const PAPER = '#fbf9f4';
export const LIGHT = '#efe6d2';
export const DARK = '#c4ad84';

// Each piece: `fill` shapes (the silhouette) and `lines` (details), on a 45 × 45 grid.
const SHAPES = {
  p: {
    fill: '<circle cx="22.5" cy="13" r="5.2"/><path d="M15.5 33.5c0-6.5 3.2-10.6 7-11.6 3.8 1 7 5.1 7 11.6z"/><rect x="17.5" y="19.3" width="10" height="3.2" rx="1.6"/><rect x="11.5" y="33.5" width="22" height="5" rx="2"/>',
    lines: '',
  },
  r: {
    fill: '<path d="M15 33.5 16.2 17.5h12.6L30 33.5z"/><path d="M12.5 10.5v6.7h20v-6.7h-4.2v3.2h-3.8v-3.2h-4v3.2h-3.8v-3.2z"/><rect x="11.5" y="33.5" width="22" height="5" rx="2"/>',
    lines: '<path d="M16.4 21h12.2M15.8 29.5h13.4"/>',
  },
  n: {
    fill: '<path d="M13.5 38.5h19c0-8-1.4-14-2.9-18.4C28 14.7 24.8 9.4 19.6 8.4L18.6 5l-2.4 4.4c-3 1.9-5.2 5.6-6 10.4-.4 2.4.6 4.4 2.6 4.6 2 .2 3.3-1.6 5-2.6 1.6-.9 2.6.6 1.6 3.4-1.2 3.4-5.9 6.6-5.9 13.3z"/>',
    lines: '<circle cx="17.6" cy="13.6" r="1.1"/><path d="M22.5 10.5c3 2.4 5 6.8 5.6 11.5"/>',
  },
  b: {
    fill: '<circle cx="22.5" cy="6.3" r="2.2"/><path d="M22.5 8.4c-5.6 4.6-6.8 9.6-4.6 13.6h9.2c2.2-4 1-9-4.6-13.6z"/><rect x="16.8" y="21.4" width="11.4" height="3.2" rx="1.6"/><path d="M15.5 33.5c0-5.4 2.9-8.6 7-9.4 4.1.8 7 4 7 9.4z"/><rect x="11.5" y="33.5" width="22" height="5" rx="2"/>',
    lines: '<path d="M24.6 12.4l-3.6 5"/>',
  },
  q: {
    fill: '<path d="M14.6 33.5 11.4 15.6l5.6 8.4.6-12.2 3.6 11.6 1.3-13.4 1.3 13.4 3.6-11.6.6 12.2 5.6-8.4-3.2 17.9z"/><circle cx="11.4" cy="14.2" r="2"/><circle cx="17.6" cy="10.6" r="2"/><circle cx="22.5" cy="8.6" r="2"/><circle cx="27.4" cy="10.6" r="2"/><circle cx="33.6" cy="14.2" r="2"/><rect x="11.5" y="33.5" width="22" height="5" rx="2"/>',
    lines: '<path d="M15.6 29.5h13.8"/>',
  },
  k: {
    fill: '<path d="M21.3 3.6h2.4v4h4v2.4h-4v6h-2.4v-6h-4V7.6h4z"/><path d="M14.4 33.5c-1.4-6.6-1.2-12.4 2.6-14.4 3-1.5 4.6 1.4 5.5 3.6.9-2.2 2.5-5.1 5.5-3.6 3.8 2 4 7.8 2.6 14.4z"/><rect x="11.5" y="33.5" width="22" height="5" rx="2"/>',
    lines: '<path d="M15.4 29.5h14.2"/>',
  },
};

// SVG markup for one piece letter (PNBRQK white, pnbrqk black), drawn into a 45-unit box.
export function pieceShapes(p) {
  const kind = p.toLowerCase();
  const white = p !== kind;
  const s = SHAPES[kind];
  const fill = white ? PAPER : INK;
  const detail = white ? INK : PAPER;
  return `<g fill="${fill}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round">${s.fill}</g>`
    + (s.lines ? `<g fill="none" stroke="${detail}" stroke-width="1.4" stroke-linecap="round">${s.lines.replace('<circle', `<circle fill="${detail}"`)}</g>` : '');
}

export function pieceSvg(p) {
  return `<svg viewBox="0 0 45 45" aria-hidden="true">${pieceShapes(p)}</svg>`;
}

// A whole board as one SVG (for thumbnails). `board`: 64 squares, a1 = 0. `flip`: Black at the bottom.
// `marks`: { from, to } squares to tint (the last move).
export function boardSvg(board, px = 300, { flip = false, marks = null } = {}) {
  const sq = px / 8;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" role="img">`;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const s = r * 8 + f;
      const x = (flip ? 7 - f : f) * sq, y = (flip ? r : 7 - r) * sq;
      out += `<rect x="${x}" y="${y}" width="${sq}" height="${sq}" fill="${(r + f) % 2 ? LIGHT : DARK}"/>`;
      if (marks && (s === marks.from || s === marks.to)) out += `<rect x="${x}" y="${y}" width="${sq}" height="${sq}" fill="#e0472b" fill-opacity=".28"/>`;
      const p = board[s];
      if (p) out += `<g transform="translate(${x} ${y}) scale(${sq / 45})">${pieceShapes(p)}</g>`;
    }
  }
  return `${out}</svg>`;
}
