import { describe, expect, it } from "vitest";
import {
  BotController,
  type BotPerception,
} from "../../../src/game/bots/BotController";
import { createRng } from "../../../src/game/sim/Rng";
import { gameConfig } from "../../../src/config/gameConfig";

function makeView(
  overrides: Partial<BotPerception["self"]> = {},
  extra: Partial<BotPerception> = {},
): BotPerception {
  return {
    gameMode: "cash",
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
  it("attacks any surviving opponent in Crashfest", () => {
    const view = makeView(
      { hp: 1 },
      {
        gameMode: "crashfest",
        enemies: [{ pid: 4, x: 2500, y: 1800, hp: 100 }],
      },
    );
    expect(stateAfter(view)).toBe("Attack");
  });

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

  it("evades a nearby enemy when hp is below 40", () => {
    const enemy = { pid: 1, x: 1100, y: 800, hp: 100 };
    expect(stateAfter(makeView({ hp: 30 }, { enemies: [enemy] }))).toBe(
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

describe("BotController aim", () => {
  it("aims down-screen (positive y) toward a target below", () => {
    const bot = new BotController(3, "hard", createRng(2));
    const input = bot.decide(
      makeView({}, { bills: [{ id: 1, x: 1000, y: 1200 }] }),
    );
    expect(input.aimY).toBeGreaterThan(0);
    expect(Math.abs(input.aimX)).toBeLessThan(0.2);
  });

  it("aims up-screen (negative y) toward a target above", () => {
    const bot = new BotController(3, "hard", createRng(2));
    const input = bot.decide(
      makeView({}, { bills: [{ id: 1, x: 1000, y: 400 }] }),
    );
    expect(input.aimY).toBeLessThan(0);
  });

  it("aims along +x for a target straight ahead", () => {
    const bot = new BotController(3, "hard", createRng(2));
    const input = bot.decide(
      makeView({}, { bills: [{ id: 1, x: 1500, y: 800 }] }),
    );
    expect(input.aimX).toBeGreaterThan(0.9);
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
      expect(held.aimX).toBe(first.aimX);
      expect(held.aimY).toBe(first.aimY);
    }
    const replanned = bot.decide(
      makeView({}, { bills: [{ id: 1, x: 1000, y: 100 }] }),
    );
    expect(replanned.aimY).toBeLessThan(0);
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
        out.push(frame.aimX, frame.aimY);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it("keeps aim within the unit circle", () => {
    const bot = new BotController(3, "hard", createRng(3));
    const frame = bot.decide(
      makeView({ angle: -3 }, { bills: [{ id: 1, x: 1000, y: 1200 }] }),
    );
    expect(Math.hypot(frame.aimX, frame.aimY)).toBeLessThanOrEqual(1 + 1e-9);
  });
});
