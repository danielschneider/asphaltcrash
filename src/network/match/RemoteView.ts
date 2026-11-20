import { gameConfig } from "../../config/gameConfig";
import type { MatchSnapshot } from "../../types/game";
import { SnapshotBuffer } from "../sync/SnapshotBuffer";

export const HOST_STEP_MS = 1000 / gameConfig.fixedStepHz;

export class RemoteView {
  private readonly buffer: SnapshotBuffer;

  constructor(buffer: SnapshotBuffer = new SnapshotBuffer()) {
    this.buffer = buffer;
  }

  push(snapshot: MatchSnapshot): void {
    this.buffer.push(snapshot);
  }

  sampleAt(hostNowMs: number): MatchSnapshot | null {
    const renderHostMs = hostNowMs - gameConfig.interpDelayMs;
    return this.buffer.sample(renderHostMs / HOST_STEP_MS) ?? null;
  }
}
