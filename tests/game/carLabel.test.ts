// @vitest-environment node
import { describe, expect, it } from "vitest";
import { truncateCarName } from "../../src/game/carLabel";
import { buildWorldView } from "../../src/game/WorldView";
import type { ArenaView, MatchSnapshot } from "../../src/types/game";

const ARENA: ArenaView = {
  width: 100,
  height: 100,
  wallThickness: 4,
  bases: [],
} as unknown as ArenaView;

function snapshotWithCars(pids: readonly number[]): MatchSnapshot {
  return {
    cars: pids.map((pid) => ({
      pid,
      x: 0,
      y: 0,
      angle: 0,
      hp: 100,
      flags: 0,
      cargo: 0,
      score: 0,
      vx: 0,
      vy: 0,
    })),
    bills: [],
    timeRemainingMs: 0,
  } as unknown as MatchSnapshot;
}

describe("truncateCarName", () => {
  it("keeps names up to the limit unchanged", () => {
    expect(truncateCarName("alice", 20)).toBe("alice");
  });

  it("cuts names longer than the limit", () => {
    expect(truncateCarName("a".repeat(25), 20)).toBe("a".repeat(20));
  });

  it("counts code points, not UTF-16 units", () => {
    expect(truncateCarName("😀".repeat(3), 2)).toBe("😀😀");
  });
});

describe("buildWorldView names", () => {
  it("attaches names by pid and marks the local car", () => {
    const names = new Map([
      [0, "me"],
      [1, "bob"],
    ]);
    const view = buildWorldView(snapshotWithCars([0, 1, 2]), ARENA, 0, names);
    expect(view.cars.map((car) => [car.pid, car.name, car.isLocal])).toEqual([
      [0, "me", true],
      [1, "bob", false],
      [2, "", false],
    ]);
  });
});
