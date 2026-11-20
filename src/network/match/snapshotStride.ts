import { gameConfig } from "../../config/gameConfig";

// Throws on non-divisors so a bad config fails at module init instead of desyncing host and client.
export function snapshotStrideFor(
  fixedStepHz: number,
  snapshotHz: number,
): number {
  if (!Number.isInteger(fixedStepHz) || fixedStepHz <= 0) {
    throw new Error(`snapshotStride: invalid fixedStepHz ${fixedStepHz}`);
  }
  if (!Number.isInteger(snapshotHz) || snapshotHz <= 0) {
    throw new Error(`snapshotStride: invalid snapshotHz ${snapshotHz}`);
  }
  if (fixedStepHz % snapshotHz !== 0) {
    throw new Error(
      `snapshotStride: snapshotHz ${snapshotHz} must divide fixedStepHz ${fixedStepHz}`,
    );
  }
  return fixedStepHz / snapshotHz;
}

// Single source of truth for host snapshot cadence (SnapshotPump) and client render delay (RemoteView).
export const SNAPSHOT_STRIDE_TICKS = snapshotStrideFor(
  gameConfig.fixedStepHz,
  gameConfig.snapshotHz,
);
