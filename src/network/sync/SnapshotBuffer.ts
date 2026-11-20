import type {
  BillSnapshot,
  CarSnapshot,
  MatchSnapshot,
} from "../../types/game";

export const SNAPSHOT_BUFFER_CAPACITY = 8;

const TWO_PI = Math.PI * 2;

export function lerpAngle(from: number, to: number, alpha: number): number {
  const delta =
    ((((to - from + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return from + delta * alpha;
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

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
  const toByPid = new Map(to.cars.map((car) => [car.pid, car]));
  return from.cars.map((car) => {
    const next = toByPid.get(car.pid);
    return next === undefined ? car : interpolateCar(car, next, alpha);
  });
}

function nearestBills(
  from: MatchSnapshot,
  to: MatchSnapshot,
  alpha: number,
): readonly BillSnapshot[] {
  return alpha < 0.5 ? from.bills : to.bills;
}

// Ring buffer of the last 8 host snapshots. sample() takes a fractional host tick.
// Out-of-range samples clamp to the oldest/newest snapshot (no extrapolation, NETWORK_PROTOCOL 6).
export class SnapshotBuffer {
  private readonly slots: (MatchSnapshot | undefined)[] = new Array<
    MatchSnapshot | undefined
  >(SNAPSHOT_BUFFER_CAPACITY).fill(undefined);
  private head = 0;
  private size = 0;

  push(snapshot: MatchSnapshot): void {
    const newest = this.newest();
    if (newest !== undefined && snapshot.tick <= newest.tick) {
      return;
    }
    this.slots[this.head] = snapshot;
    this.head = (this.head + 1) % SNAPSHOT_BUFFER_CAPACITY;
    this.size = Math.min(this.size + 1, SNAPSHOT_BUFFER_CAPACITY);
  }

  get length(): number {
    return this.size;
  }

  newest(): MatchSnapshot | undefined {
    if (this.size === 0) {
      return undefined;
    }
    const index =
      (this.head - 1 + SNAPSHOT_BUFFER_CAPACITY) % SNAPSHOT_BUFFER_CAPACITY;
    return this.slots[index];
  }

  oldest(): MatchSnapshot | undefined {
    if (this.size === 0) {
      return undefined;
    }
    const index =
      (this.head - this.size + SNAPSHOT_BUFFER_CAPACITY) %
      SNAPSHOT_BUFFER_CAPACITY;
    return this.slots[index];
  }

  sample(tick: number): MatchSnapshot | undefined {
    const oldest = this.oldest();
    const newest = this.newest();
    if (oldest === undefined || newest === undefined) {
      return undefined;
    }
    if (tick <= oldest.tick) {
      return oldest;
    }
    if (tick >= newest.tick) {
      return newest;
    }
    const pair = this.bracket(tick);
    if (pair === undefined) {
      return newest;
    }
    const [from, to] = pair;
    const span = to.tick - from.tick;
    const alpha = span === 0 ? 0 : (tick - from.tick) / span;
    return {
      tick,
      timeRemainingMs: lerp(from.timeRemainingMs, to.timeRemainingMs, alpha),
      cars: mergeCars(from, to, alpha),
      bills: nearestBills(from, to, alpha),
    };
  }

  private bracket(
    tick: number,
  ): readonly [MatchSnapshot, MatchSnapshot] | undefined {
    let previous: MatchSnapshot | undefined;
    for (let i = 0; i < this.size; i += 1) {
      const index =
        (this.head - this.size + i + SNAPSHOT_BUFFER_CAPACITY) %
        SNAPSHOT_BUFFER_CAPACITY;
      const current = this.slots[index];
      if (current === undefined) {
        continue;
      }
      if (current.tick >= tick) {
        return previous === undefined ? undefined : [previous, current];
      }
      previous = current;
    }
    return undefined;
  }
}
