import { gameConfig } from "../../config/gameConfig";
import type { BillValue } from "../../types/game";

export const BACKGROUND_COLOR = 0x2b2d31;
export const FLOOR_COLOR = 0x3a3d42;
export const PATCH_LIGHT_COLOR = 0x44474e;
export const PATCH_DARK_COLOR = 0x32353a;
export const PATCH_ALPHA = 0.6;
export const SPECKLE_LIGHT_COLOR = 0x5a5e66;
export const SPECKLE_DARK_COLOR = 0x2a2d32;
export const SPECKLE_ALPHA = 0.7;
export const SPECKLE_SIZE = 3;
export const WALL_COLOR = 0x1a1c20;
export const CURB_COLOR = 0x2c2f35;
export const CURB_EDGE_COLOR = 0x8a8f99;
export const CURB_EDGE_WIDTH = 2;
export const BASE_STROKE_WIDTH = 4;
export const BASE_FILL_ALPHA = 0.15;
export const BASE_STROKE_ALPHA = 0.8;

export const CARGO_COLOR = 0xffd166;
export const CARGO_DOT_RADIUS = 4;
export const BILL_COLORS = {
  10: 0x7ccf6b,
  20: 0x4aa3df,
  50: 0xffc857,
} as const satisfies Record<BillValue, number>;
export const BILL_STRIPE_COLOR = 0x1d3b1f;
export const BILL_CORNER_RADIUS = 4;
export const BILL_STRIPE_HEIGHT = 4;
export const DESTROYED_ALPHA = 0.3;
export const NAME_LABEL_COLOR = 0xffffff;
export const NAME_LABEL_STROKE_COLOR = 0x000000;
export const NAME_LABEL_STROKE_WIDTH = 3;
export const PARTICLE_SIZE = 6;
export const SMOKE_SIZE = 10;
export const SMOKE_COLOR = 0xb0b0b0;

export function playerColor(pid: number): number {
  const colors = gameConfig.playerColors;
  const index = ((pid % colors.length) + colors.length) % colors.length;
  return colors[index] ?? 0xffffff;
}
