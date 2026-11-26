import { describe, expect, it } from "vitest";
import { MatchSimulation } from "../../../src/game/sim/MatchSimulation";
import type {
  GameMode,
  MatchSnapshot,
  SimEvent,
} from "../../../src/types/game";

const SEED = 20260501;
const STEPS = 3000;
const HUMAN_IDS = [0, 1] as const;
const BOT_IDS = [2, 3, 4, 5, 6, 7] as const;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const ROUND_SCALE = 1e6;

interface GoldenResult {
  readonly digest: string;
  readonly eventCounts: Readonly<Record<string, number>>;
  readonly finalTick: number;
  readonly finished: boolean;
  readonly winners: readonly number[];
}

interface Hasher {
  state: number;
}

function createHasher(): Hasher {
  return { state: FNV_OFFSET };
}

function feed(hasher: Hasher, text: string): void {
  let hash = hasher.state;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  hasher.state = hash >>> 0;
}

function hex(hasher: Hasher): string {
  return hasher.state.toString(16).padStart(8, "0");
}

function round(value: number): number {
  return Math.round(value * ROUND_SCALE);
}

function serializeSnapshot(snapshot: MatchSnapshot): string {
  const cars = snapshot.cars.map((car) =>
    [
      car.pid,
      round(car.x),
      round(car.y),
      round(car.angle),
      round(car.vx),
      round(car.vy),
      round(car.hp),
      car.flags,
      car.cargo,
      car.score,
    ].join(","),
  );
  const bills = snapshot.bills.map((bill) =>
    [bill.id, round(bill.x), round(bill.y), bill.value].join(","),
  );
  return `t${snapshot.tick}|r${snapshot.timeRemainingMs}|${cars.join(";")}|${bills.join(";")}`;
}

function scriptedAim(
  tick: number,
  pid: number,
): { aimX: number; aimY: number; action: boolean; seq: number } {
  return {
    aimX: Math.cos(tick / 30 + pid),
    aimY: Math.sin(tick / 30 + pid),
    action: (tick + pid * 37) % 200 === 0,
    seq: tick,
  };
}

function runGolden(gameMode: GameMode): GoldenResult {
  const sim = new MatchSimulation({
    gameMode,
    seed: SEED,
    humanPlayerIds: [...HUMAN_IDS],
    botPlayerIds: [...BOT_IDS],
    botDifficulty: "normal",
    matchSeconds: 40,
  });
  const hasher = createHasher();
  const eventCounts: Record<string, number> = {};
  for (let i = 0; i < STEPS; i += 1) {
    for (const pid of HUMAN_IDS) {
      sim.setInput(pid, scriptedAim(sim.tick, pid));
    }
    const events: readonly SimEvent[] = sim.step();
    for (const event of events) {
      eventCounts[event.k] = (eventCounts[event.k] ?? 0) + 1;
      feed(hasher, JSON.stringify(event));
    }
    feed(hasher, serializeSnapshot(sim.snapshot()));
  }
  return {
    digest: hex(hasher),
    eventCounts,
    finalTick: sim.tick,
    finished: sim.isFinished,
    winners: [...sim.winnerPids],
  };
}

const EXPECTED: Readonly<Record<GameMode, GoldenResult>> = {
  cash: {
    digest: "fd8380f9",
    eventCounts: {
      billNew: 19,
      deliv: 2,
      hit: 5,
      pick: 9,
      respawn: 1,
      timer: 3,
    },
    finalTick: 3000,
    finished: false,
    winners: [],
  },
  crashfest: {
    digest: "0b5759b1",
    eventCounts: {
      hit: 13,
      kill: 3,
    },
    finalTick: 3000,
    finished: false,
    winners: [],
  },
};

describe("MatchSimulation determinism golden", () => {
  it.each(["cash", "crashfest"] as const)(
    "%s: 2 humans + 6 bots, fixed seed, 3000 ticks matches recorded digest",
    (gameMode) => {
      expect(runGolden(gameMode)).toEqual(EXPECTED[gameMode]);
    },
  );
});
