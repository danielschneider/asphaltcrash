import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import { MatchSimulation } from "../../../src/game/sim/MatchSimulation";
import { placeCarForTest } from "../../../src/game/sim/testing";
import type {
  MatchSetup,
  MatchSnapshot,
  SimEvents,
} from "../../../src/types/game";

const BASE_SETUP: MatchSetup = {
  seed: 42,
  humanPlayerIds: [0],
  botPlayerIds: [1, 2, 3],
  botDifficulty: "normal",
  matchSeconds: 180,
};

function scriptedInput(tick: number): {
  aimX: number;
  aimY: number;
  action: boolean;
  seq: number;
} {
  return {
    aimX: Math.cos(tick / 30),
    aimY: Math.sin(tick / 30),
    action: tick % 200 === 0,
    seq: tick,
  };
}

function runAndCollect(
  sim: MatchSimulation,
  steps: number,
): { snapshots: MatchSnapshot[]; events: SimEvents[] } {
  const snapshots: MatchSnapshot[] = [];
  const events: SimEvents[] = [];
  for (let i = 0; i < steps; i += 1) {
    sim.setInput(0, scriptedInput(sim.tick));
    events.push(sim.step());
    snapshots.push(sim.snapshot());
  }
  return { snapshots, events };
}

describe("MatchSimulation", () => {
  it("replays deterministically for the same seed and inputs", () => {
    const a = runAndCollect(new MatchSimulation(BASE_SETUP), 600);
    const b = runAndCollect(new MatchSimulation(BASE_SETUP), 600);
    expect(a.snapshots).toEqual(b.snapshots);
    expect(a.events).toEqual(b.events);
  });

  it("produces plain data snapshots that survive a JSON round trip", () => {
    const sim = new MatchSimulation(BASE_SETUP);
    runAndCollect(sim, 30);
    const snap = sim.snapshot();
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap.cars.map((car) => car.pid)).toEqual([0, 1, 2, 3]);
  });

  it("counts down the timer and emits warnings once", () => {
    const short = new MatchSimulation({
      ...BASE_SETUP,
      botPlayerIds: [],
      matchSeconds: 2,
    });
    runAndCollect(short, 120);
    expect(short.snapshot().timeRemainingMs).toBe(0);

    const sim = new MatchSimulation({
      ...BASE_SETUP,
      botPlayerIds: [],
      matchSeconds: 40,
    });
    const { events } = runAndCollect(sim, 2400);
    const timers = events
      .flat()
      .flatMap((event) => (event.k === "timer" ? [event.remainingMs] : []));
    expect(timers).toEqual([30000, 10000, 0]);
  });

  it("ignores input for unknown player ids", () => {
    const sim = new MatchSimulation(BASE_SETUP);
    expect(() =>
      sim.setInput(gameConfig.maxCars - 1, scriptedInput(0)),
    ).not.toThrow();
    expect(() => sim.step()).not.toThrow();
  });

  it("runs a full 4 human + 12 bot match at maxCars", () => {
    const humanPlayerIds = [0, 1, 2, 3];
    const botPlayerIds = Array.from(
      { length: gameConfig.maxCars - humanPlayerIds.length },
      (_, i) => i + humanPlayerIds.length,
    );
    const sim = new MatchSimulation({
      ...BASE_SETUP,
      humanPlayerIds,
      botPlayerIds,
    });
    for (let i = 0; i < 300; i += 1) {
      for (const pid of humanPlayerIds) {
        sim.setInput(pid, scriptedInput(sim.tick));
      }
      sim.step();
    }
    const snap = sim.snapshot();
    expect(snap.cars).toHaveLength(gameConfig.maxCars);
    expect(snap.cars.map((car) => car.pid)).toEqual(
      [...humanPlayerIds, ...botPlayerIds].sort((a, b) => a - b),
    );

    const spawns = [...gameConfig.humanSpawns, ...gameConfig.botSpawns];
    expect(spawns).toHaveLength(gameConfig.maxCars);
    const keys = new Set(spawns.map((spawn) => `${spawn.x}:${spawn.y}`));
    expect(keys.size).toBe(gameConfig.maxCars);
    const t = gameConfig.wallThickness;
    for (const spawn of spawns) {
      expect(spawn.x - gameConfig.baseWidth / 2).toBeGreaterThan(t);
      expect(spawn.x + gameConfig.baseWidth / 2).toBeLessThan(
        gameConfig.arenaWidth - t,
      );
      expect(spawn.y - gameConfig.baseHeight / 2).toBeGreaterThan(t);
      expect(spawn.y + gameConfig.baseHeight / 2).toBeLessThan(
        gameConfig.arenaHeight - t,
      );
    }
  });

  it("rejects duplicate player ids", () => {
    expect(
      () =>
        new MatchSimulation({
          ...BASE_SETUP,
          humanPlayerIds: [0],
          botPlayerIds: [0],
        }),
    ).toThrow();
  });

  it("delivers carried cash exactly once on the owner base", () => {
    const sim = new MatchSimulation({ ...BASE_SETUP, botPlayerIds: [] });
    let bill: MatchSnapshot["bills"][number] | undefined;
    for (let i = 0; i < 600 && bill === undefined; i += 1) {
      sim.step();
      bill = sim.snapshot().bills[0];
    }
    expect(bill).toBeDefined();
    if (bill === undefined) return;

    placeCarForTest(sim, 0, bill.x, bill.y, 0);
    let carried = 0;
    for (let i = 0; i < 30 && carried === 0; i += 1) {
      sim.step();
      carried = sim.snapshot().cars[0]?.cargo ?? 0;
    }
    expect(carried).toBe(1);

    const scoreBefore = sim.snapshot().cars[0]?.score ?? 0;
    placeCarForTest(
      sim,
      0,
      gameConfig.humanSpawns[0]?.x ?? 0,
      gameConfig.humanSpawns[0]?.y ?? 0,
      0,
    );

    let delivered: SimEvents = [];
    for (let i = 0; i < 30; i += 1) {
      const events = sim.step();
      if (events.some((event) => event.k === "deliv")) {
        delivered = events;
        break;
      }
    }
    const deliv = delivered.find((event) => event.k === "deliv");
    expect(deliv).toBeDefined();

    const car = sim.snapshot().cars[0];
    expect(car?.cargo).toBe(0);
    expect(car?.score).toBe(scoreBefore + bill.value);
    const more = sim.step();
    expect(more.some((event) => event.k === "deliv")).toBe(false);
    expect(sim.snapshot().cars[0]?.score).toBe(scoreBefore + bill.value);
  });
});
