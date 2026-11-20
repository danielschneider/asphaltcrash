import { gameConfig } from "../../config/gameConfig";
import type { MatchSnapshot } from "../../types/game";
import { toSnapMessage } from "../protocol/codec";
import type { SnapMessage } from "../protocol/messages";

export interface SnapshotSource {
  snapshot(): MatchSnapshot;
}

const SNAPSHOT_STRIDE = Math.round(
  gameConfig.fixedStepHz / gameConfig.snapshotHz,
);

export class SnapshotPump {
  private readonly source: SnapshotSource;
  private readonly acks: ReadonlyMap<number, number>;

  constructor(
    source: SnapshotSource,
    acks: ReadonlyMap<number, number> = new Map(),
  ) {
    this.source = source;
    this.acks = acks;
  }

  due(tick: number): boolean {
    return tick % SNAPSHOT_STRIDE === 0;
  }

  capture(): MatchSnapshot {
    return this.source.snapshot();
  }

  buildSnapshotMessage(snapshot: MatchSnapshot, pid: number): SnapMessage {
    return toSnapMessage(snapshot, this.acks.get(pid) ?? 0);
  }
}
