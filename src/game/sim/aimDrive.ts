import { gameConfig } from "../../config/gameConfig";

export interface AimDrive {
  readonly steer: number;
  readonly throttle: number;
}

const TWO_PI = Math.PI * 2;

export function wrapAngle(angle: number): number {
  const wrapped = ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return wrapped;
}

// The car turns toward the aim direction and drives only once roughly aligned. A misaligned car brakes before it pivots.
export function aimDrive(
  aimX: number,
  aimY: number,
  heading: number,
  forwardSpeedPxs: number,
): AimDrive {
  const magnitude = Math.hypot(aimX, aimY);
  if (magnitude === 0) return { steer: 0, throttle: 0 };
  const error = wrapAngle(Math.atan2(aimY, aimX) - heading);
  const steer = clampUnit(error / gameConfig.aimTurnFullAngleRad);
  const aligned = Math.abs(error) <= gameConfig.aimDriveAngleRad;
  if (aligned) {
    return { steer, throttle: magnitude };
  }
  const isMovingForward = forwardSpeedPxs > gameConfig.aimBrakeSpeedPxs;
  return { steer, throttle: isMovingForward ? -1 : 0 };
}

export interface WallAim {
  readonly aimX: number;
  readonly aimY: number;
  readonly isBlocked: boolean;
}

interface Normal {
  readonly x: number;
  readonly y: number;
}

const BLOCKED_EPSILON = 1e-3;

// Normals point from the wall into the car. Aim components pushing into a wall are removed so the car slides along it.
// When nothing remains (corner or head-on), the car is blocked and must reverse.
export function slideAim(
  aimX: number,
  aimY: number,
  normals: readonly Normal[],
): WallAim {
  let x = aimX;
  let y = aimY;
  for (const n of normals) {
    const into = x * n.x + y * n.y;
    if (into >= 0) continue;
    x -= into * n.x;
    y -= into * n.y;
  }
  const originalMagnitude = Math.hypot(aimX, aimY);
  if (originalMagnitude === 0) return { aimX: 0, aimY: 0, isBlocked: false };
  const projected = Math.hypot(x, y);
  if (projected < BLOCKED_EPSILON) {
    return { aimX: 0, aimY: 0, isBlocked: true };
  }
  const scale = originalMagnitude / projected;
  return { aimX: x * scale, aimY: y * scale, isBlocked: false };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}
