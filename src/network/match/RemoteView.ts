import { gameConfig } from "../../config/gameConfig";
import type { MatchSnapshot } from "../../types/game";
import { SnapshotBuffer } from "../sync/SnapshotBuffer";
import { SNAPSHOT_STRIDE_TICKS } from "./snapshotStride";

export const HOST_STEP_MS = 1000 / gameConfig.fixedStepHz;

const DELAY_TICKS = gameConfig.interpDelayMs / HOST_STEP_MS;
const SNAP_THRESHOLD_TICKS = 2 * SNAPSHOT_STRIDE_TICKS;
const EASE_RATE_PER_SEC = 4;
const MAX_RATE_DEVIATION = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Render tick advances per frame at the fixed-step rate, so motion stays smooth between snapshots.
// Drift from the delayed target (newest - DELAY_TICKS) is eased out; large drift snaps.
export class RemoteView {
  private readonly buffer: SnapshotBuffer;
  private renderTick: number | null = null;
  private loggedNull = false;
  private loggedValue = false;

  constructor(buffer: SnapshotBuffer = new SnapshotBuffer()) {
    this.buffer = buffer;
  }

  push(snapshot: MatchSnapshot): void {
    this.buffer.push(snapshot);
  }

  advance(dtSeconds: number): MatchSnapshot | null {
    const oldest = this.buffer.oldest();
    const newest = this.buffer.newest();
    if (oldest === undefined || newest === undefined) {
      this.logNull();
      return null;
    }
    const dt = Math.max(dtSeconds, 0);
    const target = newest.tick - DELAY_TICKS;
    this.renderTick = this.nextRenderTick(target, dt);
    this.renderTick = clamp(this.renderTick, oldest.tick, newest.tick);
    const sample = this.buffer.sample(this.renderTick);
    if (sample === undefined) {
      this.logNull();
      return null;
    }
    this.logValue(sample.cars.length);
    return sample;
  }

  private nextRenderTick(target: number, dt: number): number {
    const current = this.renderTick;
    if (current === null || Math.abs(target - current) > SNAP_THRESHOLD_TICKS) {
      return target;
    }
    const ticksPerFrame = dt * gameConfig.fixedStepHz;
    const advanced = current + ticksPerFrame;
    const gain = 1 - Math.exp(-EASE_RATE_PER_SEC * dt);
    const maxCorrection = ticksPerFrame * MAX_RATE_DEVIATION;
    const correction = clamp(
      (target - advanced) * gain,
      -maxCorrection,
      maxCorrection,
    );
    return advanced + correction;
  }

  private logNull(): void {
    if (this.loggedNull) return;
    this.loggedNull = true;
    console.log(`[mp][view] sampleAt null bufferLen=${this.buffer.length}`);
  }

  private logValue(cars: number): void {
    if (this.loggedValue) return;
    this.loggedValue = true;
    console.log(`[mp][view] sampleAt first value cars=${cars}`);
  }
}
