import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import {
  SNAPSHOT_STRIDE_TICKS,
  snapshotStrideFor,
} from "../../../src/network/match/snapshotStride";

describe("snapshot stride", () => {
  it("is 3 ticks for 60 Hz sim and 20 Hz snapshots", () => {
    expect(snapshotStrideFor(60, 20)).toBe(3);
    expect(SNAPSHOT_STRIDE_TICKS).toBe(
      gameConfig.fixedStepHz / gameConfig.snapshotHz,
    );
    expect(SNAPSHOT_STRIDE_TICKS).toBe(3);
  });

  it("rejects a snapshotHz that does not divide fixedStepHz", () => {
    expect(() => snapshotStrideFor(60, 24)).toThrow(/must divide/);
    expect(() => snapshotStrideFor(60, 7)).toThrow(/must divide/);
  });

  it("rejects non-positive or non-integer rates", () => {
    expect(() => snapshotStrideFor(60, 0)).toThrow(/invalid snapshotHz/);
    expect(() => snapshotStrideFor(0, 20)).toThrow(/invalid fixedStepHz/);
    expect(() => snapshotStrideFor(60, 20.5)).toThrow(/invalid snapshotHz/);
  });
});
