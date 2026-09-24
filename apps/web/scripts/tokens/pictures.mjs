/* The token pictures: one entry per launch image in public/tokens/.
 *
 * Each entry is data for `compose` — an accent, a `draw` for the outlined
 * subject, an optional `fx` for effects drawn over it, and the backdrop's
 * sparkles. Original drawings of shared themes only: no logo, brand or
 * trademark.
 */

import { BTC, btc, word, wordWidth } from "./lettering.mjs";
import { mix, N, P, segDist } from "./raster.mjs";

export const ART = {
  pizza: {
    title: "A slice of pizza",
    accent: P.amber,
    sparkles: [[5, 6], [27, 24, true], [25, 5]],
    draw(s) {
      s.poly([[6, 9], [26, 9], [16.5, 29]], P.sun);
      s.shade((x, y) => y > 9 && x > 16.5 + (y - 9) * 0.1 && x < 16.5 + (29 - y) * 0.48 && (x + y) % 7 < 1.2, P.sun, P.sunDeep);
      // Crust: a rounded rim across the wide end.
      s.capsule(6, 7.5, 26, 7.5, 2.4, P.crust);
      s.capsule(7, 6.8, 25, 6.8, 0.9, P.cream);
      s.rect(7, 9, 19, 1, P.crustDeep);
      for (const [x, y, r] of [[11.5, 13, 2.2], [20, 13.5, 2.2], [15.5, 19, 2.1], [17, 24.5, 1.4]]) {
        s.disc(x, y, r, P.red);
        s.px(x - 0.6, y - 0.8, P.cream);
      }
      s.disc(15.5, 19, 0.9, P.redDeep);
      for (const [x, y] of [[9, 11], [22, 17], [13, 16], [19, 21]]) s.px(x, y, P.limeDeep);
      // A drip of cheese off the edge.
      s.rect(10, 10, 1, 3, P.sun).rect(22, 10, 1, 2, P.sun);
    },
  },

  genesis: {
    title: "The genesis block, a glowing cube",
    accent: P.cyan,
    sparkles: [[5, 7, true], [27, 26], [26, 6]],
    draw(s) {
      const top = [[16, 5], [27, 10.5], [16, 16], [5, 10.5]];
      s.poly(top, P.cyan);
      s.poly([[5, 10.5], [16, 16], [16, 28.5], [5, 23]], P.cyanDeep);
      s.poly([[16, 16], [27, 10.5], [27, 23], [16, 28.5]], P.cyanDark);
      // Edges catch the light.
      s.line(5, 10, 16, 15.5, P.ink);
      s.line(16, 15.5, 27, 10, P.ink);
      s.line(16, 16, 16, 28, mix(P.cyan, P.ink, 0.4));
      // Block zero, on the left face.
      word(s, 8, 17, "0", P.ink);
      // Seams on the right face: stacked transactions.
      for (const y of [17, 20, 23]) s.line(19, y + 1, 25, y - 2, mix(P.cyanDark, P.cyan, 0.45));
    },
  },

  hodl: {
    title: "A diamond that does not let go",
    accent: P.magenta,
    sparkles: [[6, 6, true], [26, 5], [27, 20]],
    draw(s) {
      s.poly([[9, 5], [23, 5], [28, 11], [16, 25], [4, 11]], P.magenta);
      s.poly([[9, 5], [16, 5], [12, 11], [4, 11]], mix(P.magenta, P.ink, 0.55));
      s.poly([[16, 5], [23, 5], [20, 11], [12, 11]], mix(P.magenta, P.ink, 0.25));
      s.poly([[23, 5], [28, 11], [20, 11]], P.magentaDeep);
      s.poly([[12, 11], [20, 11], [16, 25]], mix(P.magenta, P.violetDeep, 0.35));
      s.poly([[20, 11], [28, 11], [16, 25]], P.magentaDeep);
      s.line(4, 11, 28, 11, P.ink);
      s.px(8, 8, P.ink).px(9, 7, P.ink);
      word(s, 16 - Math.floor(wordWidth("HODL") / 2), 26, "HODL", P.sun);
    },
  },

  laser: {
    title: "A grinning face with laser eyes",
    accent: P.red,
    sparkles: [[27, 27], [5, 27, true]],
    draw(s) {
      s.disc(16, 17, 11.5, P.sun);
      s.shade((x, y) => x + y > 38, P.sun, P.sunDeep);
      s.disc(12, 13.5, 2.6, P.outline).disc(20, 13.5, 2.6, P.outline);
      s.disc(12, 13.5, 1.5, P.red).disc(20, 13.5, 1.5, P.red);
      s.px(12, 13, P.ink).px(20, 13, P.ink);
      // A wide grin.
      s.fill((x, y) => y > 19 && y < 24 && (x - 16) ** 2 / 49 + (y - 19) ** 2 / 16 <= 1, P.outline);
      s.rect(11, 20, 10, 1, P.ink);
      s.px(16, 23, P.red).px(15, 23, P.red).px(17, 22, P.red);
    },
    fx(e) {
      // The beams leave the page: that is the point of them.
      for (const [x0, y0] of [[12, 13.5], [20, 13.5]]) {
        e.capsule(x0 - 2, y0 - 2, x0 - 12, y0 - 12, 1.3, mix(P.red, P.bg, 0.15));
        e.line(x0 - 2, y0 - 2, x0 - 12, y0 - 12, P.ink);
      }
      e.disc(12, 13.5, 1.2, P.ink).disc(20, 13.5, 1.2, P.ink);
    },
  },

  stack: {
    title: "A stack of coins, saved one at a time",
    accent: P.mint,
    sparkles: [[5, 8], [27, 17]],
    draw(s) {
      // Each coin seen edge-on: a lit rim, a face and a shadowed lip.
      const coin = (x, y) => {
        s.rect(x + 1, y, 14, 1, P.amberSoft);
        s.rect(x, y + 1, 16, 1, P.amber);
        s.rect(x + 1, y + 2, 14, 1, P.amberDeep);
        s.px(x + 3, y + 1, P.cream).px(x + 4, y + 1, P.cream);
      };
      [[7, 26], [8, 23], [6, 20], [8, 17], [7, 14]].forEach(([x, y]) => coin(x, y));
      // The top coin, face up.
      s.ellipse(15, 13.5, 8, 2.2, P.amber);
      s.ellipse(15, 13.3, 5.5, 1.2, P.amberSoft);
      // A coin on its way in.
      s.disc(24.5, 7, 5, P.amber);
      s.ring(24.5, 7, 5, 1, P.amberDeep);
    },
    fx(e) {
      btc(e, 21, 3, P.amberDeep);
      e.px(20, 13, P.mint).px(21, 12, P.mint).px(22, 13, P.mint);
    },
  },

  orange: {
    title: "An orange pill",
    accent: P.amberDeep,
    sparkles: [[6, 24, true], [25, 26], [7, 6]],
    draw(s) {
      s.capsule(9, 23, 23, 9, 6.2, P.ink);
      s.fill((x, y) => segDist(x, y, 9, 23, 23, 9) <= 6.2 && x + y > 32, P.amber);
      s.shade((x, y) => x + y > 36 && segDist(x, y, 9, 23, 23, 9) > 4.2 && x - y > -2, P.amber, P.amberDeep);
      s.shade((x, y) => segDist(x, y, 9, 23, 23, 9) > 4.2 && x - y > 0, P.ink, P.dim);
      // Shine.
      s.line(8, 18, 12, 14, P.ink);
      s.line(18, 8, 21, 5, P.cream);
      // The seam.
      s.line(12, 20, 20, 12, P.amberDeep);
    },
  },

  node: {
    title: "A server rack, every light on",
    accent: P.cyan,
    sparkles: [[5, 5], [27, 27, true]],
    draw(s) {
      s.rect(7, 4, 18, 25, P.slate);
      s.rect(7, 4, 18, 1, P.steel);
      s.rect(24, 5, 1, 24, P.deep);
      for (const y of [6, 12, 18]) {
        s.rect(9, y, 14, 5, P.deep);
        s.rect(9, y, 14, 1, P.steel);
        for (let x = 15; x < 22; x += 2) s.rect(x, y + 2, 1, 2, P.line);
        s.px(10, y + 2, P.mint).px(12, y + 2, y === 12 ? P.amber : P.mint).px(10, y + 3, P.cyan);
      }
      s.rect(9, 24, 14, 3, P.deep);
      for (let x = 10; x < 18; x += 2) s.rect(x, 25, 1, 1, P.line);
      s.disc(20.5, 25.5, 1.2, P.amber);
      s.rect(8, 29, 3, 1, P.steel).rect(21, 29, 3, 1, P.steel);
    },
    fx(e) {
      e.px(10, 8, P.ink).px(10, 14, P.ink).px(10, 20, P.ink);
    },
  },

  halving: {
    title: "A coin split in half",
    accent: P.amber,
    sparkles: [[16, 4, true], [5, 26], [27, 25]],
    draw(s) {
      const crack = (y) => 16 + (Math.floor(y) % 4 < 2 ? 0.8 : -0.8);
      s.fill((x, y) => (x - 14) ** 2 + (y - 16) ** 2 <= 110 && x < crack(y) - 0.6, P.amber);
      s.fill((x, y) => (x - 18) ** 2 + (y - 17.5) ** 2 <= 110 && x > crack(y - 1.5) + 2.6, P.amber);
      s.shade((x, y) => (x - 14) ** 2 + (y - 16) ** 2 <= 60, P.amber, P.amberSoft);
      s.shade((x, y) => (x - 18) ** 2 + (y - 17.5) ** 2 <= 60, P.amber, P.amberSoft);
      s.shade((x, y) => (x - 14) ** 2 + (y - 16) ** 2 >= 90 && x + y > 28, P.amber, P.amberDeep);
      s.shade((x, y) => (x - 18) ** 2 + (y - 17.5) ** 2 >= 90 && x + y > 34, P.amber, P.amberDeep);
      // Half of the mark on each half.
      s.stamp(10, 12, BTC.map((r) => r.slice(0, 4)), { "#": P.amberDeep });
      s.stamp(20, 13.5, BTC.map((r) => r.slice(3)), { "#": P.amberDeep });
    },
    fx(e) {
      for (const [x, y] of [[17, 9], [18, 12], [17, 16], [18, 20], [17, 24]]) e.px(x, y, P.sun);
      e.px(18, 7, P.ink).px(17, 27, P.ink);
    },
  },

  cypher: {
    title: "A hooded figure with glowing eyes",
    accent: P.violet,
    sparkles: [[5, 6], [26, 5, true]],
    draw(s) {
      s.poly([[16, 3], [26, 11], [28, 29], [4, 29], [6, 11]], P.violetDeep);
      s.poly([[16, 3], [26, 11], [28, 29], [16, 29]], P.violetDark);
      s.ellipse(16, 15, 6.5, 7.5, P.outline);
      s.fill((x, y) => y > 21 && y < 29 && Math.abs(x - 16) < 3, P.outline);
      s.rect(12, 14, 3, 1, P.cyan).rect(18, 14, 3, 1, P.cyan);
      s.px(13, 15, P.cyanDeep).px(19, 15, P.cyanDeep);
      // Binary on the hood.
      word(s, 6, 22, "01", P.violet);
      word(s, 22, 22, "10", P.violet);
      s.line(16, 4, 16, 7, P.violet);
    },
    fx(e) {
      e.px(12, 14, P.ink).px(20, 14, P.ink);
    },
  },

  timechn: {
    title: "A clock whose hours are blocks",
    accent: P.mint,
    sparkles: [[4, 5], [27, 27]],
    draw(s) {
      s.disc(16, 16, 13, P.deep);
      s.ring(16, 16, 13, 1.4, P.mint);
      for (let h = 0; h < 12; h++) {
        const a = (h / 12) * Math.PI * 2;
        const x = 16 + Math.sin(a) * 9.6;
        const y = 16 - Math.cos(a) * 9.6;
        const big = h % 3 === 0;
        s.rect(Math.round(x - (big ? 1 : 0.5)), Math.round(y - (big ? 1 : 0.5)), big ? 2 : 1, big ? 2 : 1, big ? P.mint : P.mintDeep);
      }
      s.line(16, 16, 16, 9, P.ink);
      s.line(16, 16, 21, 19, P.ink);
      s.rect(15, 15, 2, 2, P.amber);
    },
  },

  liveqa: {
    title: "An invader that passed its tests",
    accent: P.magenta,
    sparkles: [[5, 5, true], [27, 6]],
    draw(s) {
      s.stamp(5, 6, [
        "..#.......#..",
        "...#.....#...",
        "..#########..",
        ".##.#####.##.",
        "#############",
        "#.#########.#",
        "#.#.......#.#",
        "...##...##...",
      ].map((r) => r.replace(/#/g, "m")), { m: P.magenta });
      s.rect(9, 9, 1, 1, P.ink).rect(15, 9, 1, 1, P.ink);
      // Scale it: every cell above becomes 2×2 by redrawing at double size.
      const small = s.cells.map((row) => row.slice());
      s.cells.forEach((row) => row.fill(null));
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) if (small[y][x]) s.rect((x - 5) * 2 + 3, (y - 6) * 2 + 4, 2, 2, small[y][x]);
      // A pass mark.
      s.disc(24, 24, 5.5, P.mint);
      s.line(21, 24, 23, 26, P.outline).line(23, 26, 27, 22, P.outline);
    },
  },

  demo: {
    title: "The demo invader",
    accent: P.lime,
    sparkles: [[4, 5], [28, 5, true]],
    draw(s) {
      const bot = [
        "...#.....#...",
        "....#...#....",
        "...#######...",
        "..##.###.##..",
        ".###########.",
        ".#.#######.#.",
        ".#.#.....#.#.",
        "....##.##....",
      ];
      bot.forEach((row, j) => [...row].forEach((c, i) => c === "#" && s.rect(3 + i * 2, 3 + j * 2, 2, 2, P.lime)));
      s.rect(11, 9, 2, 2, P.outline).rect(19, 9, 2, 2, P.outline);
      s.rect(3, 21, 26, 8, P.lime);
      word(s, 16 - Math.floor(wordWidth("DEMO") / 2), 23, "DEMO", P.outline);
    },
  },

  // ── examples of community tokens ──

  surf: {
    title: "A curling wave and a surfboard under the sun",
    accent: P.cyan,
    sparkles: [[27, 4]],
    draw(s) {
      s.disc(8, 8, 4, P.sun);
      s.disc(8, 8, 2.5, P.amberSoft);
      // The wave: a round wall of water, hollow where it curls over.
      s.fill((x, y) => (x - 14) ** 2 + (y - 18) ** 2 <= 81 && y < 27, P.cyan);
      s.fill((x, y) => (x - 16.5) ** 2 + (y - 20) ** 2 <= 20 && y < 27, P.cyanDark);
      s.fill((x, y) => x > 16 && y > 20 && y < 27 && x < 23, P.cyanDark);
      s.shade((x, y) => (x - 14) ** 2 + (y - 18) ** 2 >= 56 && y < 17, P.cyan, P.ink);
      s.fill((x, y) => y >= 24 && y < 28 && x > 2 && x < 30, P.cyanDeep);
      s.fill((x, y) => y >= 24 && y < 25 && x > 2 && x < 30, P.cyan);
      // The lip of the curl, falling.
      s.px(19, 16, P.ink).px(20, 17, P.ink).px(20, 18, P.cyan).px(19, 18, P.cyan);
      // The board, planted in the sand.
      s.capsule(26, 11, 25, 26, 1.7, P.magenta);
      s.line(26, 11, 25, 26, P.ink);
      s.rect(3, 28, 27, 1, P.amberSoft);
    },
    fx(e) {
      for (const [x, y] of [[5, 23], [8, 22], [22, 23], [11, 26], [18, 27]]) e.px(x, y, P.ink);
    },
  },

  homes: {
    title: "Two houses on a shared street",
    accent: P.amber,
    sparkles: [[26, 4, true], [4, 6]],
    draw(s) {
      // The neighbour, smaller, behind.
      s.rect(19, 15, 9, 13, P.violet);
      s.poly([[17.5, 16], [23.5, 9.5], [29.5, 16]], P.violetDeep);
      s.rect(21, 18, 3, 3, P.sun);
      s.rect(25, 22, 2, 6, P.violetDark);
      // The house.
      s.rect(5, 14, 14, 14, P.amber);
      s.poly([[3, 15], [12, 5], [21, 15]], P.red);
      s.shade((x, y) => x > 12, P.red, P.redDeep);
      s.rect(15, 6, 2, 5, P.slate);
      s.rect(10, 20, 4, 8, P.crustDeep);
      s.px(13, 24, P.sun);
      s.rect(6, 17, 3, 3, P.sun).rect(15, 17, 3, 3, P.sun);
      s.px(7, 18, P.amberSoft).px(16, 18, P.amberSoft);
      s.rect(3, 28, 26, 1, P.mintDeep);
    },
  },

  earth: {
    title: "The world, with a coin in orbit",
    accent: P.mint,
    sparkles: [[5, 26, true], [27, 26]],
    draw(s) {
      s.disc(15, 17, 11, P.cyanDeep);
      s.shade((x, y) => (x - 12) ** 2 + (y - 14) ** 2 < 40, P.cyanDeep, P.cyan);
      const land = [
        [[8, 10], [13, 8], [15, 11], [12, 15], [9, 16], [6, 13]],
        [[16, 17], [21, 15], [24, 19], [20, 25], [17, 23]],
        [[9, 20], [12, 21], [11, 25], [8, 23]],
      ];
      for (const shape of land) s.poly(shape, P.mint);
      s.shade((x, y) => x + y > 34, P.mint, P.mintDeep);
      // The coin, in orbit.
      s.disc(25, 7, 4.8, P.amber);
      s.disc(25, 7, 3.6, P.amberSoft);
    },
    fx(e) {
      btc(e, 22, 3, P.amberDeep);
      for (const [x, y] of [[20, 11], [18, 13], [8, 28], [12, 29]]) e.px(x, y, mix(P.ink, P.mint, 0.3));
    },
  },

  books: {
    title: "A stack of library books",
    accent: P.violet,
    sparkles: [[26, 5, true], [5, 9]],
    draw(s) {
      const book = (x, y, w, h, c, dark) => {
        s.rect(x, y, w, h, c);
        s.rect(x, y + h - 1, w, 1, dark);
        s.rect(x + w - 2, y + 1, 1, h - 2, P.cream);
        s.rect(x + 2, y + 1, 1, h - 2, mix(c, P.ink, 0.4));
      };
      book(5, 22, 22, 6, P.violetDeep, P.violetDark);
      book(7, 17, 19, 5, P.cyanDeep, P.cyanDark);
      book(4, 12, 21, 5, P.magenta, P.magentaDeep);
      // An open book on top.
      s.poly([[6, 11], [16, 9], [16, 5], [6, 7]], P.cream);
      s.poly([[16, 9], [26, 11], [26, 7], [16, 5]], P.ink);
      s.line(16, 5, 16, 9, P.faint);
      for (const y of [7, 8]) s.line(8, y, 14, y - 1, P.faint), s.line(18, y - 1, 24, y, P.faint);
      s.rect(16, 9, 1, 4, P.red);
    },
  },

  kickoff: {
    title: "A football, mid-kick",
    accent: P.magenta,
    sparkles: [[27, 5, true], [26, 27]],
    draw(s) {
      s.disc(17, 16, 10.5, P.ink);
      s.shade((x, y) => x + y > 38, P.ink, P.dim);
      const patch = (cx, cy, r) => s.poly(
        Array.from({ length: 5 }, (_, i) => [cx + r * Math.sin((i / 5) * Math.PI * 2), cy - r * Math.cos((i / 5) * Math.PI * 2)]),
        P.deep,
      );
      patch(17, 16, 3.4);
      patch(17, 6.8, 2.6);
      patch(25.6, 13, 2.4);
      patch(23, 24, 2.4);
      patch(11, 24, 2.4);
      patch(8.4, 13, 2.4);
      s.fill((x, y) => (x - 17) ** 2 + (y - 16) ** 2 > 110, P.ink);
      s.cells.forEach((row, y) => row.forEach((c, x) => {
        if (c && (x + 0.5 - 17) ** 2 + (y + 0.5 - 16) ** 2 > 10.5 ** 2) row[x] = null;
      }));
    },
    fx(e) {
      for (const [y, len] of [[11, 4], [16, 5], [21, 4]]) e.rect(1, y, len, 1, P.magenta);
    },
  },

  brew: {
    title: "A cup of coffee with a heart in the foam",
    accent: P.sun,
    sparkles: [[5, 5, true], [27, 26]],
    draw(s) {
      s.ring(24, 19, 4.6, 1.8, P.ink);
      s.poly([[6, 12], [24, 12], [22, 27], [8, 27]], P.ink);
      s.shade((x, y) => x > 18, P.ink, P.dim);
      s.ellipse(15, 12.5, 9, 2.2, P.cocoa);
      s.ellipse(15, 12.5, 6, 1.3, P.crust);
      s.stamp(12, 11, ["##.##", "#####", ".###."], { "#": P.cream });
      s.rect(9, 19, 13, 2, P.sun);
      s.ellipse(15, 29, 12, 1.4, P.faint);
    },
    fx(e) {
      // Steam: three wisps that curl as they rise.
      for (const [x, top] of [[11, 5], [15, 3], [19, 5]]) {
        for (let y = top; y < 10; y++) e.px(x + Math.round(Math.sin((y - top) * 1.1)), y, P.dim);
      }
    },
  },
};
