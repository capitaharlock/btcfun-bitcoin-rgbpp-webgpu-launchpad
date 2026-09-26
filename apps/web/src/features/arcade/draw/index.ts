/* Drawing the arcade onto a canvas: the shared world, the game's layer on top
 * of it, and the screens between games.
 *
 * `pen` puts cells and text on the grid, `sprites` holds the game's own
 * bitmaps, `palette` names the colours by role; `scene` composes the world a
 * frame of either mode starts from and `game` the play over it. This index is
 * what the cabinet imports.
 */

export type { ScenePalette } from "./palette";
export { drawText } from "./pen";
export { drawScene, type WorldView } from "./scene";
export { drawGame, drawReady, type Pointer } from "./game";
