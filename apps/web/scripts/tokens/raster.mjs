/* The raster every token picture is drawn on: a 32×32 grid of colour cells.
 *
 * `Layer` is the only drawing surface; shapes are rasterised by testing each
 * cell's centre, so every edge lands on the grid and scales crisply. The
 * palette lives here because layers are coloured with it and nothing else.
 */

export const N = 32;

// The theme's neon palette (src/ui/theme-arcade.css), plus the few earth tones
// food and wood need.
export const P = {
  bg: "#0a0a0d",
  ink: "#f5f2e9",
  dim: "#c2beb3",
  faint: "#8f8b84",
  steel: "#5b5b6b",
  slate: "#3d3d4a",
  deep: "#25252e",
  line: "#1b1b23",
  outline: "#050507",
  amber: "#ff9f1a",
  amberSoft: "#ffc861",
  amberDeep: "#ff6a00",
  cyan: "#2ee6ff",
  cyanDeep: "#0aa3c2",
  cyanDark: "#06596e",
  violet: "#a78bff",
  violetDeep: "#6d3cff",
  violetDark: "#3a1f8f",
  magenta: "#ff4fd3",
  magentaDeep: "#b0249a",
  lime: "#b9ff3b",
  limeDeep: "#6fb814",
  mint: "#3dffa6",
  mintDeep: "#12a36a",
  sun: "#ffe14d",
  sunDeep: "#e0a800",
  red: "#ff4d6d",
  redDeep: "#c21f45",
  crust: "#d9893a",
  crustDeep: "#9a5320",
  cocoa: "#6b3a1e",
  cream: "#ffe9c4",
};

export function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

export class Layer {
  constructor() {
    this.cells = Array.from({ length: N }, () => Array(N).fill(null));
  }
  px(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < N && y < N) this.cells[y][x] = c;
    return this;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < N && y < N ? this.cells[y][x] : null;
  }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
    return this;
  }
  /** Every cell whose centre passes `test(cx, cy)`. */
  fill(test, c) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (test(x + 0.5, y + 0.5)) this.px(x, y, c);
    return this;
  }
  disc(cx, cy, r, c) {
    return this.fill((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, c);
  }
  ellipse(cx, cy, rx, ry, c) {
    return this.fill((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, c);
  }
  ring(cx, cy, r, w, c) {
    return this.fill((x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      return d <= r && d > r - w;
    }, c);
  }
  /** A thick segment with round caps. */
  capsule(x0, y0, x1, y1, r, c) {
    return this.fill((x, y) => segDist(x, y, x0, y0, x1, y1) <= r, c);
  }
  poly(points, c) {
    return this.fill((x, y) => inside(points, x, y), c);
  }
  line(x0, y0, x1, y1, c) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) this.px(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, c);
    return this;
  }
  /** Text bitmap: each character is a key into `pal`; '.' and ' ' are empty. */
  stamp(x, y, rows, pal) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => pal[ch] && this.px(x + i, y + j, pal[ch])));
    return this;
  }
  /** Replace one colour with another where `test(x, y)` holds. */
  shade(test, from, to) {
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) if (this.cells[y][x] === from && test(x + 0.5, y + 0.5)) this.cells[y][x] = to;
    return this;
  }
}

export function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

export function inside(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
