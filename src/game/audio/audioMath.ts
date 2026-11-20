import type { GameConfigShape } from "../../config/gameConfig";

type EngineTuning = Pick<
  GameConfigShape,
  | "audioEngineIdleHz"
  | "audioEngineMaxHz"
  | "audioEngineIdleGain"
  | "audioEngineMaxGain"
>;
type AccelTuning = Pick<
  GameConfigShape,
  "audioAccelThreshold" | "audioAccelMaxGain"
>;
type SqueakTuning = Pick<
  GameConfigShape,
  | "audioSqueakTurnRate"
  | "audioSqueakMaxGain"
  | "audioSqueakMinSpeedFraction"
  | "audioSqueakFullTurnRate"
>;
type DistanceTuning = Pick<GameConfigShape, "audioHearingRadiusPx">;

const THROTTLE_PITCH_HZ = 8;

const TWO_PI = Math.PI * 2;
const ENGINE_LOAD_SPEED_WEIGHT = 0.5;
const ENGINE_LOAD_THROTTLE_WEIGHT = 0.5;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function wrapAngle(radians: number): number {
  return ((((radians + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
}

export function engineFrequencyHz(
  speedFraction: number,
  throttle: number,
  cfg: EngineTuning,
): number {
  const span = Math.max(0, cfg.audioEngineMaxHz - cfg.audioEngineIdleHz);
  return (
    cfg.audioEngineIdleHz +
    span * clamp01(speedFraction) +
    THROTTLE_PITCH_HZ * clamp01(throttle)
  );
}

export function engineGain(
  speedFraction: number,
  throttle: number,
  cfg: EngineTuning,
): number {
  const load =
    ENGINE_LOAD_SPEED_WEIGHT * clamp01(speedFraction) +
    ENGINE_LOAD_THROTTLE_WEIGHT * clamp01(throttle);
  const idle = cfg.audioEngineIdleGain;
  return clamp01(idle + (cfg.audioEngineMaxGain - idle) * load);
}

export function accelGain(throttle: number, cfg: AccelTuning): number {
  const level = clamp01(throttle);
  const range = 1 - cfg.audioAccelThreshold;
  if (level <= cfg.audioAccelThreshold || range <= 0) return 0;
  return (
    cfg.audioAccelMaxGain * clamp01((level - cfg.audioAccelThreshold) / range)
  );
}

export function squealGain(
  turnRateRadPerSec: number,
  speedFraction: number,
  cfg: SqueakTuning,
): number {
  const rate = Number.isFinite(turnRateRadPerSec)
    ? Math.abs(turnRateRadPerSec)
    : 0;
  if (clamp01(speedFraction) < cfg.audioSqueakMinSpeedFraction) return 0;
  if (rate < cfg.audioSqueakTurnRate) return 0;
  const span = cfg.audioSqueakFullTurnRate - cfg.audioSqueakTurnRate;
  const ramp = span <= 0 ? 1 : clamp01((rate - cfg.audioSqueakTurnRate) / span);
  return cfg.audioSqueakMaxGain * ramp;
}

export function distanceGain(distancePx: number, cfg: DistanceTuning): number {
  const radius = cfg.audioHearingRadiusPx;
  if (Number.isNaN(distancePx) || radius <= 0) return 0;
  return clamp01(1 - Math.max(0, distancePx) / radius);
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function turnRateRadPerSec(
  prevAngle: number,
  angle: number,
  dt: number,
): number {
  if (!isPositiveFinite(dt)) return 0;
  const delta = wrapAngle(angle - prevAngle);
  return Number.isFinite(delta) ? delta / dt : 0;
}

export function speedFractionFromDelta(
  dxPx: number,
  dyPx: number,
  dt: number,
  maxSpeedPx: number,
): number {
  if (!isPositiveFinite(dt) || !isPositiveFinite(maxSpeedPx)) return 0;
  return clamp01(Math.hypot(dxPx, dyPx) / dt / maxSpeedPx);
}

export function throttleFromSpeedChange(
  prevSpeedFraction: number,
  speedFraction: number,
  dt: number,
  maxSpeedPx: number,
  accelPxPerSec2: number,
): number {
  if (
    !isPositiveFinite(dt) ||
    !isPositiveFinite(maxSpeedPx) ||
    !isPositiveFinite(accelPxPerSec2)
  ) {
    return 0;
  }
  const accel = ((speedFraction - prevSpeedFraction) * maxSpeedPx) / dt;
  return clamp01(accel / accelPxPerSec2);
}
