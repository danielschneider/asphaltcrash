import { describe, expect, it } from "vitest";
import { MatchSimulation } from "../../../src/game/sim/MatchSimulation";
import { SnapshotPump } from "../../../src/network/match/SnapshotPump";
import type { MatchSnapshot } from "../../../src/types/game";

const SNAP: MatchSnapshot = {
  tick: 0,
  timeRemainingMs: 0,
  cars: [],
  bills: [],
};

function sourceOf(tick: number) {
  return { snapshot: (): MatchSnapshot => ({ ...SNAP, tick }) };
}

describe("SnapshotPump", () => {
  it("is due every 3rd host tick (20 Hz at 60 Hz)", () => {
    const pump = new SnapshotPump(sourceOf(0));
    const dueTicks = [0, 1, 2, 3, 4, 5, 6].filter((t) => pump.due(t));
    expect(dueTicks).toEqual([0, 3, 6]);
  });

  it("captures from the source", () => {
    const pump = new SnapshotPump(sourceOf(9));
    expect(pump.capture().tick).toBe(9);
  });

  it("sets ack per pid, 0 when unknown", () => {
    const pump = new SnapshotPump(sourceOf(0), new Map([[1, 42]]));
    expect(pump.buildSnapshotMessage(SNAP, 1).ak).toBe(42);
    expect(pump.buildSnapshotMessage(SNAP, 0).ak).toBe(0);
    expect(pump.buildSnapshotMessage(SNAP, 0).t).toBe("snap");
  });

  it("builds from a real simulation", () => {
    const sim = new MatchSimulation({
      seed: 7,
      humanPlayerIds: [0, 1],
      botPlayerIds: [],
      botDifficulty: "normal",
      matchSeconds: 180,
    });
    const pump = new SnapshotPump(sim, new Map([[0, 5]]));
    const msg = pump.buildSnapshotMessage(sim.snapshot(), 0);
    expect(msg.cars).toHaveLength(2);
    expect(msg.ak).toBe(5);
  });
});
