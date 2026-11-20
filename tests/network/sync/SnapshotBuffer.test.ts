import { describe, expect, it } from "vitest";
import type { MatchSnapshot } from "../../../src/types/game";
import { SnapshotBuffer } from "../../../src/network/sync/SnapshotBuffer";

function snap(tick: number, x: number, angle: number): MatchSnapshot {
  return {
    tick,
    timeRemainingMs: 1000 - tick,
    cars: [
      {
        pid: 0,
        x,
        y: 0,
        angle,
        vx: 0,
        vy: 0,
        hp: 100,
        flags: 0,
        cargo: 0,
        score: 0,
      },
    ],
    bills: [{ id: 1, x: tick, y: 0, value: 10 }],
  };
}

describe("SnapshotBuffer", () => {
  it("returns undefined when empty", () => {
    expect(new SnapshotBuffer().sample(5)).toBeUndefined();
  });

  it("interpolates linearly and shortest-arc angle between samples", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snap(0, 0, 3.1));
    buffer.push(snap(10, 100, -3.1));
    const mid = buffer.sample(5);
    expect(mid?.cars[0]?.x).toBeCloseTo(50);
    expect(Math.abs(Math.abs(mid?.cars[0]?.angle ?? 0) - Math.PI)).toBeLessThan(
      0.05,
    );
  });

  it("clamps at the oldest and newest boundaries", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snap(10, 0, 0));
    buffer.push(snap(20, 10, 0));
    expect(buffer.sample(0)?.tick).toBe(10);
    expect(buffer.sample(99)?.tick).toBe(20);
    expect(buffer.sample(20)?.cars[0]?.x).toBe(10);
  });

  it("handles missing samples by bracketing the next available pair", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snap(0, 0, 0));
    buffer.push(snap(3, 30, 0));
    buffer.push(snap(6, 60, 0));
    expect(buffer.sample(4.5)?.cars[0]?.x).toBeCloseTo(45);
  });

  it("keeps only the last 8 snapshots and ignores stale pushes", () => {
    const buffer = new SnapshotBuffer();
    for (let t = 0; t < 12; t += 1) buffer.push(snap(t, t, 0));
    buffer.push(snap(5, 999, 0));
    expect(buffer).toHaveLength(8);
    expect(buffer.oldest()?.tick).toBe(4);
    expect(buffer.newest()?.tick).toBe(11);
  });
});
