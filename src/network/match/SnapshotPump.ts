import type { MatchSnapshot } from "../../types/game";
import { toSnapMessage } from "../protocol/codec";
import type { SnapMessage } from "../protocol/messages";
import { SNAPSHOT_STRIDE_TICKS } from "./snapshotStride";

export interface SnapshotSource {
  snapshot(): MatchSnapshot;
}

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
    return tick % SNAPSHOT_STRIDE_TICKS === 0;
  }

  capture(): MatchSnapshot {
    return this.source.snapshot();
  }

  buildSnapshotMessage(snapshot: MatchSnapshot, pid: number): SnapMessage {
    return toSnapMessage(snapshot, this.acks.get(pid) ?? 0);
  }
}
