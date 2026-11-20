import type { CarSnapshot, MatchSnapshot } from "../../types/game";

const TWO_PI = Math.PI * 2;

// Shortest arc: the delta is wrapped into [-PI, PI) before scaling.
function lerpAngle(from: number, to: number, alpha: number): number {
  const delta =
    ((((to - from + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return from + delta * alpha;
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

// Discrete fields (hp, flags, cargo, score) switch at the midpoint instead of blending.
function interpolateCar(
  from: CarSnapshot,
  to: CarSnapshot,
  alpha: number,
): CarSnapshot {
  const discrete = alpha < 0.5 ? from : to;
  return {
    pid: from.pid,
    x: lerp(from.x, to.x, alpha),
    y: lerp(from.y, to.y, alpha),
    angle: lerpAngle(from.angle, to.angle, alpha),
    vx: lerp(from.vx, to.vx, alpha),
    vy: lerp(from.vy, to.vy, alpha),
    hp: discrete.hp,
    flags: discrete.flags,
    cargo: discrete.cargo,
    score: discrete.score,
  };
}

function mergeCars(
  from: MatchSnapshot,
  to: MatchSnapshot,
  alpha: number,
): readonly CarSnapshot[] {
  return from.cars.map((car) => {
    const next = to.cars.find((candidate) => candidate.pid === car.pid);
    return next === undefined ? car : interpolateCar(car, next, alpha);
  });
}

// Pure; alpha is expected in [0, 1]. Bills are not blended: the nearer snapshot's list is used.
export function interpolateSnapshot(
  from: MatchSnapshot,
  to: MatchSnapshot,
  alpha: number,
  tick: number,
): MatchSnapshot {
  return {
    tick,
    timeRemainingMs: lerp(from.timeRemainingMs, to.timeRemainingMs, alpha),
    cars: mergeCars(from, to, alpha),
    bills: alpha < 0.5 ? from.bills : to.bills,
  };
}
