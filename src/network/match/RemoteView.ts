import { gameConfig } from "../../config/gameConfig";
import type { MatchSnapshot } from "../../types/game";
import { SnapshotBuffer } from "../sync/SnapshotBuffer";

export const HOST_STEP_MS = 1000 / gameConfig.fixedStepHz;

export class RemoteView {
  private readonly buffer: SnapshotBuffer;
  private loggedNull = false;
  private loggedValue = false;

  constructor(buffer: SnapshotBuffer = new SnapshotBuffer()) {
    this.buffer = buffer;
  }

  push(snapshot: MatchSnapshot): void {
    this.buffer.push(snapshot);
  }

  sampleAt(_hostNowMs: number): MatchSnapshot | null {
    const newest = this.buffer.newest();
    const sample =
      newest === undefined
        ? undefined
        : this.buffer.sample(
            newest.tick - gameConfig.interpDelayMs / HOST_STEP_MS,
          );
    if (sample === undefined) {
      if (!this.loggedNull) {
        this.loggedNull = true;
        console.log(`[mp][view] sampleAt null bufferLen=${this.buffer.length}`);
      }
      return null;
    }
    if (!this.loggedValue) {
      this.loggedValue = true;
      console.log(`[mp][view] sampleAt first value cars=${sample.cars.length}`);
    }
    return sample;
  }
}
