import { Container, Graphics } from "pixi.js";
import { gameConfig } from "../../config/gameConfig";
import type { ArenaView } from "../../types/game";
import { generateGroundLayout } from "../ground/groundLayout";
import {
  BASE_FILL_ALPHA,
  BASE_STROKE_ALPHA,
  BASE_STROKE_WIDTH,
  CURB_COLOR,
  CURB_EDGE_COLOR,
  CURB_EDGE_WIDTH,
  FLOOR_COLOR,
  PATCH_ALPHA,
  PATCH_DARK_COLOR,
  PATCH_LIGHT_COLOR,
  playerColor,
  SPECKLE_ALPHA,
  SPECKLE_DARK_COLOR,
  SPECKLE_LIGHT_COLOR,
  SPECKLE_SIZE,
  WALL_COLOR,
} from "./palette";

export function drawArena(layer: Container, arena: ArenaView): void {
  const layout = generateGroundLayout(arena, gameConfig.visualSeed, gameConfig);
  const floor = new Graphics();
  floor.rect(0, 0, arena.width, arena.height).fill(FLOOR_COLOR);
  for (const patch of layout.patches) {
    floor.rect(patch.x, patch.y, patch.width, patch.height).fill({
      color: patch.tone === "light" ? PATCH_LIGHT_COLOR : PATCH_DARK_COLOR,
      alpha: PATCH_ALPHA,
    });
  }
  const speckles = new Graphics();
  for (const point of layout.speckles) {
    speckles.rect(point.x, point.y, SPECKLE_SIZE, SPECKLE_SIZE).fill({
      color: point.tone === "light" ? SPECKLE_LIGHT_COLOR : SPECKLE_DARK_COLOR,
      alpha: SPECKLE_ALPHA,
    });
  }
  const walls = new Graphics();
  const t = arena.wallThickness;
  walls.rect(0, 0, arena.width, t).fill(WALL_COLOR);
  walls.rect(0, arena.height - t, arena.width, t).fill(WALL_COLOR);
  walls.rect(0, 0, t, arena.height).fill(WALL_COLOR);
  walls.rect(arena.width - t, 0, t, arena.height).fill(WALL_COLOR);
  for (const curb of layout.curbs) {
    walls
      .rect(curb.x, curb.y, curb.width, curb.height)
      .fill(CURB_COLOR)
      .stroke({ width: CURB_EDGE_WIDTH, color: CURB_EDGE_COLOR, alpha: 0.6 });
  }
  const bases = new Graphics();
  for (const base of arena.bases) {
    const color = playerColor(base.pid);
    bases
      .rect(
        base.x - base.width / 2,
        base.y - base.height / 2,
        base.width,
        base.height,
      )
      .fill({ color, alpha: BASE_FILL_ALPHA })
      .stroke({ width: BASE_STROKE_WIDTH, color, alpha: BASE_STROKE_ALPHA });
  }
  layer.addChild(floor, speckles, walls, bases);
}
