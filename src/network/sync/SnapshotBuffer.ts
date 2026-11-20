import type { MatchSnapshot } from "../../types/game";
import { interpolateSnapshot } from "../../game/sim/interpolate";

export const SNAPSHOT_BUFFER_CAPACITY = 8;

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
    return interpolateSnapshot(from, to, alpha, tick);
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
