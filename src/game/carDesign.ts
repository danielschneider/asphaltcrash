import { gameConfig } from "../config/gameConfig";

export interface CarRectShape {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly fill: number;
  readonly alpha: number;
}

export interface CarCircleShape {
  readonly kind: "circle";
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly fill: number;
  readonly alpha: number;
}

export type CarShape = CarRectShape | CarCircleShape;

const WHEEL_COLOR = 0x15171c;
const WHEEL_WIDTH = 7;
const WHEEL_DEPTH = 4;
const WHEEL_X_RATIO = 0.29;
const WINDSHIELD_COLOR = 0x9fd8ff;
const REAR_WINDOW_COLOR = 0x5fa8d3;
const HEADLIGHT_COLOR = 0xfff1b8;
const TAILLIGHT_COLOR = 0xff3b3b;
const STRIPE_COLOR = 0xffffff;
const STRIPE_ALPHA = 0.35;
const BODY_RADIUS = 4;
const CABIN_SHADE = 0.35;

function shade(color: number, amount: number): number {
  const channel = (shift: number): number =>
    Math.round(((color >> shift) & 0xff) * (1 - amount));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: number,
  alpha = 1,
): CarRectShape {
  return { kind: "rect", x, y, width, height, radius, fill, alpha };
}

function circle(
  x: number,
  y: number,
  radius: number,
  fill: number,
): CarCircleShape {
  return { kind: "circle", x, y, radius, fill, alpha: 1 };
}

// Car-local coordinates centred on the body, nose toward +x. The game renderer
// and the start-screen logo both draw this list, so they cannot drift apart.
export function buildCarShapes(bodyColor: number): readonly CarShape[] {
  const w = gameConfig.carWidth;
  const h = gameConfig.carHeight;
  const halfW = w / 2;
  const halfH = h / 2;
  const wheelX = w * WHEEL_X_RATIO;
  const wheels = [-wheelX, wheelX].flatMap((x) => [
    rect(
      x - WHEEL_WIDTH / 2,
      -halfH - 2,
      WHEEL_WIDTH,
      WHEEL_DEPTH,
      1,
      WHEEL_COLOR,
    ),
    rect(
      x - WHEEL_WIDTH / 2,
      halfH - 2,
      WHEEL_WIDTH,
      WHEEL_DEPTH,
      1,
      WHEEL_COLOR,
    ),
  ]);
  return [
    ...wheels,
    rect(-halfW, -halfH, w, h, BODY_RADIUS, bodyColor),
    rect(-halfW + 2, -1, w - 4, 2, 0, STRIPE_COLOR, STRIPE_ALPHA),
    rect(-8, -8, 20, 16, 3, shade(bodyColor, CABIN_SHADE)),
    rect(-7, -6, 5, 12, 1, REAR_WINDOW_COLOR),
    rect(6, -6, 6, 12, 1, WINDSHIELD_COLOR),
    circle(halfW - 1.5, -7, 2, HEADLIGHT_COLOR),
    circle(halfW - 1.5, 7, 2, HEADLIGHT_COLOR),
    circle(-halfW + 1.5, -7, 1.6, TAILLIGHT_COLOR),
    circle(-halfW + 1.5, 7, 1.6, TAILLIGHT_COLOR),
  ];
}
