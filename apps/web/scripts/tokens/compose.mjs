/* From a drawing to an SVG: the arcade-sticker composition and the encoder.
 *
 * `compose` stacks backdrop, drop shadow, outline, subject and effects into
 * one flat layer; `toSvg` turns it into one path per colour, a horizontal run
 * per command, which keeps each file a few kilobytes.
 */

import { Layer, mix, N, P } from "./raster.mjs";

export function sparkle(layer, x, y, c, big = false) {
  layer.px(x, y, c).px(x - 1, y, c).px(x + 1, y, c).px(x, y - 1, c).px(x, y + 1, c);
  if (big) layer.px(x - 2, y, c).px(x + 2, y, c).px(x, y - 2, c).px(x, y + 2, c);
}

export function compose({ accent, draw, fx, sparkles = [] }) {
  const back = new Layer();
  back.disc(16, 16, 15, mix(P.bg, accent, 0.1));
  back.disc(16, 16, 12, mix(P.bg, accent, 0.17));
  for (const [x, y, big] of sparkles) sparkle(back, x, y, mix(P.bg, accent, 0.55), big);

  const subject = new Layer();
  draw(subject);

  const outline = new Layer();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (subject.get(x, y)) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => subject.get(x + dx, y + dy));
      if (near) outline.px(x, y, P.outline);
    }

  const shadow = new Layer();
  const shadowTone = mix(P.bg, accent, 0.06);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) if (subject.get(x, y) || outline.get(x, y)) shadow.px(x + 1, y + 1, shadowTone);

  const effects = new Layer();
  fx?.(effects, subject);

  const flat = new Layer();
  for (const layer of [back, shadow, outline, subject, effects])
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (layer.get(x, y)) flat.px(x, y, layer.get(x, y));
  return flat;
}

export function toSvg(layer, title) {
  const runs = new Map();
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const c = layer.get(x, y);
      let end = x + 1;
      while (end < N && layer.get(end, y) === c) end++;
      if (c) runs.set(c, (runs.get(c) ?? "") + `M${x} ${y}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  }
  const paths = [...runs].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" shape-rendering="crispEdges">` +
    `<title>${title}</title><rect width="512" height="512" fill="${P.bg}"/>` +
    `<g transform="scale(16)">${paths}</g></svg>\n`
  );
}
