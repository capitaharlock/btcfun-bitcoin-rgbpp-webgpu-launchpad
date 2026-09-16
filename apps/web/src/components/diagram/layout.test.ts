import { describe, expect, it } from "vitest";

import { CIRCUIT, MINER_CELL, MINT_TX, TICKET_TX } from "../../docs/pages/mint/diagrams";
import { assignGutters, defaultSides, layout, placeBytes, route, simplify, type Box, type Port } from "./layout";
import type { DiagramSpec } from "./model";
import { textWidth, wrap } from "./text";

const box = (x: number, y: number, w = 100, h = 40): Box => ({ x, y, w, h });
const port = (x: number, y: number, side: Port["side"], owner = box(0, 0)): Port => ({ x, y, side, owner });

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("text", () => {
  it("wraps to the width and keeps an over-long identifier whole", () => {
    const lines = wrap("sign input 0 and output 0 with SIGHASH_SINGLE|ANYONECANPAY today", 120, 13);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) {
      if (!line.includes("SIGHASH")) expect(textWidth(line, 13)).toBeLessThanOrEqual(120);
    }
    expect(lines).toContain("SIGHASH_SINGLE|ANYONECANPAY");
  });

  it("breaks on an explicit newline", () => {
    expect(wrap("9,500 → promoter\n500 → platform", 999, 12)).toEqual(["9,500 → promoter", "500 → platform"]);
  });

  it("measures monospace wider per glyph than narrow sans glyphs", () => {
    expect(textWidth("iiii", 12, true)).toBeGreaterThan(textWidth("iiii", 12));
  });
});

describe("routes", () => {
  it("is a straight line between aligned ports", () => {
    expect(route(port(50, 40, "bottom"), port(50, 120, "top"), NaN)).toEqual([
      { x: 50, y: 40, side: "bottom", owner: box(0, 0) },
      { x: 50, y: 120, side: "top", owner: box(0, 0) },
    ]);
  });

  it("bends twice, at mid-height, between offset columns", () => {
    const points = route(port(50, 40, "bottom"), port(250, 120, "top"), NaN);
    expect(points.map((p) => [p.x, p.y])).toEqual([
      [50, 40],
      [50, 80],
      [250, 80],
      [250, 120],
    ]);
  });

  it("bends once from a side into a top", () => {
    const points = route(port(100, 20, "right"), port(300, 200, "top"), NaN);
    expect(points.map((p) => [p.x, p.y])).toEqual([
      [100, 20],
      [300, 20],
      [300, 200],
    ]);
  });

  it("runs same-side routes through the gutter", () => {
    const points = route(port(100, 20, "right"), port(100, 200, "right"), 140);
    expect(points.map((p) => [p.x, p.y])).toEqual([
      [100, 20],
      [140, 20],
      [140, 200],
      [100, 200],
    ]);
  });

  it("keeps every segment orthogonal", () => {
    const points = route(port(10, 10, "left"), port(300, 400, "top"), NaN);
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it("drops collinear and repeated points", () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 5 }, { x: 0, y: 9 }, { x: 4, y: 9 }])).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 9 },
      { x: 4, y: 9 },
    ]);
  });

  it("nests gutter routes so the shorter one runs inside the longer", () => {
    const owner = box(0, 0, 200, 400);
    const long = { a: port(200, 10, "right", owner), b: port(200, 390, "right", owner) };
    const short = { a: port(200, 100, "right", owner), b: port(200, 150, "right", owner) };
    const [longX, shortX] = assignGutters([long, short]);
    expect(shortX).toBeGreaterThan(200);
    expect(longX).toBeGreaterThan(shortX);
  });

  it("chooses sides from geometry", () => {
    expect(defaultSides(box(0, 0), box(0, 100), false)).toEqual(["bottom", "top"]);
    expect(defaultSides(box(0, 0), box(200, 0), false)).toEqual(["right", "left"]);
    expect(defaultSides(box(0, 0), box(200, 100), true)).toEqual(["right", "top"]);
    expect(defaultSides(box(0, 100), box(0, 0), false)).toEqual(["right", "right"]);
  });
});

describe("byte strip", () => {
  it("fills the strip exactly, larger fields wider", () => {
    const strip = box(10, 0, 300, 30);
    const placed = placeBytes([{ label: "state", bytes: 1 }, { label: "nonce", bytes: 8 }, { label: "anchor", bytes: 4 }], strip);
    const end = placed[placed.length - 1].box;
    expect(end.x + end.w).toBeCloseTo(310);
    expect(placed[1].box.w).toBeGreaterThan(placed[2].box.w);
    expect(placed[2].box.w).toBeGreaterThan(placed[0].box.w);
  });
});

describe("layout", () => {
  const specs: DiagramSpec[] = [CIRCUIT, MINER_CELL, TICKET_TX, MINT_TX];

  for (const spec of specs) {
    it(`places "${spec.title}" without overlap and inside the canvas`, () => {
      const g = layout(spec);
      for (let i = 0; i < g.nodes.length; i++) {
        for (let j = i + 1; j < g.nodes.length; j++) {
          expect(overlaps(g.nodes[i].box, g.nodes[j].box), `${g.nodes[i].id} overlaps ${g.nodes[j].id}`).toBe(false);
        }
      }
      for (const edge of g.edges) {
        expect(edge.points.length).toBeGreaterThanOrEqual(2);
        for (const p of edge.points) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(g.width);
          expect(p.y).toBeLessThanOrEqual(g.height);
        }
      }
    });
  }

  it("centres the nodes of one row on one line", () => {
    const g = layout(CIRCUIT);
    const open = g.nodes.find((n) => n.id === "open")!.box;
    const idle = g.nodes.find((n) => n.id === "idle")!.box;
    expect(open.y + open.h / 2).toBeCloseTo(idle.y + idle.h / 2);
  });

  it("stacks rows without overlap even when a row holds a tall diamond", () => {
    const g = layout(CIRCUIT);
    const paid = g.nodes.find((n) => n.id === "paid")!.box;
    const anchor = g.nodes.find((n) => n.id === "anchor")!.box;
    expect(anchor.y).toBeGreaterThan(paid.y + paid.h);
  });

  it("labels decision branches yes and no", () => {
    const labels = layout(CIRCUIT).edges.flatMap((e) => (e.label ? [e.label.text] : []));
    expect(labels).toContain("yes");
    expect(labels).toContain("no");
  });

  it("lands an edge to a transaction item on that item's edge", () => {
    const g = layout(TICKET_TX);
    const btc = g.nodes.find((n) => n.id === "btc");
    if (btc?.kind !== "transaction") throw new Error("expected the Bitcoin transaction");
    const seal = btc.columns.outputs.find((p) => p.item.id === "seal")!.box;
    const edge = g.edges.find((e) => e.kind === "seal" && e.points[e.points.length - 1].y === seal.y + seal.h / 2);
    expect(edge).toBeDefined();
    expect(edge!.points[edge!.points.length - 1].x).toBeCloseTo(seal.x + seal.w);
  });

  it("refuses a declaration that names what does not exist", () => {
    const base: DiagramSpec = { title: "t", description: "d", lanes: [{ id: "a" }], nodes: [], edges: [] };
    expect(() => layout({ ...base, nodes: [{ id: "x", lane: "nope", row: 0, kind: "terminal", label: "x" }] })).toThrow(/unknown lane/);
    expect(() =>
      layout({ ...base, nodes: [{ id: "x", lane: "a", row: 0, kind: "terminal", label: "x" }], edges: [{ from: "x", to: "y" }] }),
    ).toThrow(/unknown node/);
    expect(() =>
      layout({ ...base, nodes: [{ id: "x", lane: "a", row: 0, kind: "terminal", label: "x" }], edges: [{ from: "x.item", to: "x" }] }),
    ).toThrow(/only a transaction/);
  });
});
