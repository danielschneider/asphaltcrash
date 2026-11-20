import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import {
  BotController,
  type BotPerception,
} from "../../../src/game/bots/BotController";
import { createRng } from "../../../src/game/sim/Rng";

function makeView(
  overrides: Partial<BotPerception["self"]> = {},
  extra: Partial<BotPerception> = {},
): BotPerception {
  return {
    self: {
      x: 1000,
      y: 800,
      angle: 0,
      speed: 0,
      hp: 100,
      cargo: 0,
      pid: 3,
      baseX: 200,
      baseY: 800,
      ...overrides,
    },
    bills: [],
    enemies: [],
    tick: 0,
    fallback: { x: 1200, y: 800 },
    ...extra,
  };
}

function stateAfter(view: BotPerception): string {
  const bot = new BotController(3, "normal", createRng(1));
  bot.decide(view);
  return bot.state;
}

describe("BotController state selection", () => {
  it("delivers when carrying cash", () => {
    expect(stateAfter(makeView({ cargo: 2 }))).toBe("DeliverCash");
  });

  it("recovers when hp is below 30", () => {
    expect(stateAfter(makeView({ hp: 20, cargo: 2 }))).toBe("Recover");
  });

  it("attacks an enemy inside the attack radius", () => {
    const enemy = {
      pid: 1,
      x: 1000 + gameConfig.botAttackRadiusPx - 10,
      y: 800,
      hp: 100,
    };
    expect(stateAfter(makeView({}, { enemies: [enemy] }))).toBe("Attack");
  });

  it("evades a nearby enemy when hp is below 60", () => {
    const enemy = { pid: 1, x: 1100, y: 800, hp: 100 };
    expect(stateAfter(makeView({ hp: 50 }, { enemies: [enemy] }))).toBe(
      "Evade",
    );
  });

  it("seeks bills when only bills are visible", () => {
    const view = makeView({}, { bills: [{ id: 7, x: 1500, y: 800 }] });
    expect(stateAfter(view)).toBe("SeekBill");
  });

  it("ignores destroyed enemies", () => {
    const enemy = { pid: 1, x: 1050, y: 800, hp: 0 };
    expect(stateAfter(makeView({}, { enemies: [enemy] }))).toBe("SeekBill");
  });
});

describe("BotController steering", () => {
  it("steers right (positive) toward a target below the heading", () => {
    const bot = new BotController(3, "hard", createRng(2));
    const input = bot.decide(
      makeView({}, { bills: [{ id: 1, x: 1000, y: 1200 }] }),
    );
    expect(input.steer).toBeGreaterThan(0);
  });

  it("steers left (negative) toward a target above the heading", () => {
    const bot = new BotController(3, "hard", createRng(2));
    const input = bot.decide(
      makeView({}, { bills: [{ id: 1, x: 1000, y: 400 }] }),
    );
    expect(input.steer).toBeLessThan(0);
  });

  it("throttles fully when the target is roughly ahead", () => {
    const bot = new BotController(3, "hard", createRng(2));
    const input = bot.decide(
      makeView({}, { bills: [{ id: 1, x: 1500, y: 800 }] }),
    );
    expect(input.throttle).toBe(1);
  });
});

describe("BotController timing and determinism", () => {
  it("holds the last decision between reaction-delay ticks", () => {
    const bot = new BotController(3, "normal", createRng(5));
    const first = bot.decide(
      makeView({}, { bills: [{ id: 1, x: 1000, y: 1200 }] }),
    );
    const period = gameConfig.botProfiles.normal.reactionDelayTicks;
    for (let i = 1; i < period; i += 1) {
      const held = bot.decide(
        makeView({}, { bills: [{ id: 1, x: 1000, y: 100 }] }),
      );
      expect(held.steer).toBe(first.steer);
      expect(held.throttle).toBe(first.throttle);
    }
    const replanned = bot.decide(
      makeView({}, { bills: [{ id: 1, x: 1000, y: 100 }] }),
    );
    expect(replanned.steer).toBeLessThan(0);
  });

  it("increments seq on every decide call", () => {
    const bot = new BotController(3, "easy", createRng(9));
    const seqs = [0, 1, 2, 3].map(() => bot.decide(makeView()).seq);
    expect(seqs).toEqual([1, 2, 3, 4]);
  });

  it("produces identical output for identical seeds", () => {
    const run = (): number[] => {
      const bot = new BotController(3, "easy", createRng(42));
      const out: number[] = [];
      for (let i = 0; i < 40; i += 1) {
        const frame = bot.decide(
          makeView(
            { angle: i * 0.1 },
            { bills: [{ id: 1, x: 1000, y: 1200 }] },
          ),
        );
        out.push(frame.steer, frame.throttle);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it("keeps outputs within the clamped input range", () => {
    const bot = new BotController(3, "hard", createRng(3));
    const frame = bot.decide(
      makeView({ angle: -3 }, { bills: [{ id: 1, x: 1000, y: 1200 }] }),
    );
    expect(Math.abs(frame.steer)).toBeLessThanOrEqual(1);
    expect(frame.throttle).toBeGreaterThanOrEqual(-1);
    expect(frame.throttle).toBeLessThanOrEqual(1);
  });
});
