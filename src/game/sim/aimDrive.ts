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

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}
