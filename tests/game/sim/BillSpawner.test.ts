import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import { BillSpawner } from "../../../src/game/sim/BillSpawner";
import { createRng } from "../../../src/game/sim/Rng";

const arena = {
  width: gameConfig.arenaWidth,
  height: gameConfig.arenaHeight,
  wallThickness: gameConfig.wallThickness,
};

const bases = [
  {
    x: 100,
    y: 100,
    width: gameConfig.baseWidth,
    height: gameConfig.baseHeight,
  },
  {
    x: arena.width - 100 - gameConfig.baseWidth,
    y: arena.height - 100 - gameConfig.baseHeight,
    width: gameConfig.baseWidth,
    height: gameConfig.baseHeight,
  },
];

const intervalTicks = gameConfig.billSpawnIntervalSeconds * 60;

function makeIdGen(): () => number {
  let id = 0;
  return () => {
    id += 1;
    return id;
  };
}

function spawnSeries(seed: number, count: number) {
  const spawner = new BillSpawner(createRng(seed), arena, bases);
  const nextId = makeIdGen();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(
      spawner.maybeSpawn(intervalTicks * (i + 1), 0, intervalTicks * i, nextId),
    );
  }
  return out;
}

describe("BillSpawner", () => {
  it("does not spawn before the interval has elapsed", () => {
    const spawner = new BillSpawner(createRng(1), arena, bases);
    expect(spawner.maybeSpawn(intervalTicks - 1, 0, 0, makeIdGen())).toBeNull();
    expect(spawner.maybeSpawn(intervalTicks, 0, 0, makeIdGen())).not.toBeNull();
  });

  it("does not spawn when the field is at maxBillsOnField", () => {
    const spawner = new BillSpawner(createRng(1), arena, bases);
    expect(
      spawner.maybeSpawn(
        intervalTicks * 10,
        gameConfig.maxBillsOnField,
        0,
        makeIdGen(),
      ),
    ).toBeNull();
    expect(
      spawner.maybeSpawn(
        intervalTicks * 10,
        gameConfig.maxBillsOnField - 1,
        0,
        makeIdGen(),
      ),
    ).not.toBeNull();
  });

  it("uses injected ids", () => {
    const spawner = new BillSpawner(createRng(3), arena, bases);
    const bill = spawner.maybeSpawn(intervalTicks, 0, 0, () => 77);
    expect(bill?.id).toBe(77);
  });

  it("is deterministic for the same seed", () => {
    expect(spawnSeries(42, 30)).toEqual(spawnSeries(42, 30));
  });

  it("produces values from the configured set", () => {
    const allowed = new Set<number>(gameConfig.billValues);
    for (const bill of spawnSeries(5, 200)) {
      expect(bill).not.toBeNull();
      expect(allowed.has(bill?.value ?? -1)).toBe(true);
    }
  });

  it("keeps bills inside the walls and away from bases", () => {
    for (const bill of spawnSeries(11, 200)) {
      if (bill === null) continue;
      expect(bill.x).toBeGreaterThanOrEqual(
        gameConfig.billRadius + arena.wallThickness,
      );
      expect(bill.x).toBeLessThanOrEqual(
        arena.width - gameConfig.billRadius - arena.wallThickness,
      );
      expect(bill.y).toBeGreaterThanOrEqual(
        gameConfig.billRadius + arena.wallThickness,
      );
      expect(bill.y).toBeLessThanOrEqual(
        arena.height - gameConfig.billRadius - arena.wallThickness,
      );
      for (const base of bases) {
        const dx = Math.max(base.x - bill.x, 0, bill.x - (base.x + base.width));
        const dy = Math.max(
          base.y - bill.y,
          0,
          bill.y - (base.y + base.height),
        );
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(
          gameConfig.billMinDistanceFromBase,
        );
      }
    }
  });

  it("returns null when no valid position exists", () => {
    const fullCover = [
      { x: 0, y: 0, width: arena.width, height: arena.height },
    ];
    const spawner = new BillSpawner(createRng(1), arena, fullCover);
    expect(spawner.maybeSpawn(intervalTicks, 0, 0, makeIdGen())).toBeNull();
  });
});
