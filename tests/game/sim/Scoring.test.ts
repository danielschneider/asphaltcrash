import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import {
  scoreDelivery,
  scoreKill,
  timerEventsCrossed,
  timerRemainingMs,
} from "../../../src/game/sim/Scoring";
import { resolveWinners } from "../../../src/game/WorldView";

describe("scoreDelivery", () => {
  it("adds truncated integer amounts", () => {
    const scores = new Map<number, number>();
    scoreDelivery(scores, 1, 20);
    scoreDelivery(scores, 1, 10.9);
    expect(scores.get(1)).toBe(30);
  });

  it("ignores non-finite amounts", () => {
    const scores = new Map<number, number>();
    scoreDelivery(scores, 1, Number.NaN);
    expect(scores.has(1)).toBe(false);
  });
});

describe("scoreKill", () => {
  it("awards killBonus to the attacker", () => {
    const scores = new Map<number, number>();
    scoreKill(scores, 2);
    expect(scores.get(2)).toBe(gameConfig.killBonus);
  });
});

describe("timerRemainingMs", () => {
  it("counts down from matchSeconds and clamps at 0", () => {
    expect(timerRemainingMs(0, 180)).toBe(180_000);
    expect(timerRemainingMs(60, 180)).toBe(179_000);
    expect(timerRemainingMs(180 * 60 + 500, 180)).toBe(0);
  });
});

describe("timerEventsCrossed", () => {
  it("fires each warning exactly once across a run of ticks", () => {
    const fired: number[] = [];
    let prev = timerRemainingMs(0, 40);
    for (let tick = 1; tick <= 40 * 60; tick += 1) {
      const now = timerRemainingMs(tick, 40);
      fired.push(...timerEventsCrossed(prev, now));
      prev = now;
    }
    expect(fired).toEqual([30, 10, 0]);
  });

  it("returns nothing when no threshold is crossed", () => {
    expect(timerEventsCrossed(31_000, 30_500)).toEqual([]);
  });

  it("fires 30 once when crossing it in one step", () => {
    expect(timerEventsCrossed(31_000, 29_000)).toEqual([30]);
  });
});

describe("resolveWinners", () => {
  it("returns an empty array for no entries", () => {
    expect(resolveWinners(new Map())).toEqual([]);
  });

  it("returns the single leader", () => {
    expect(
      resolveWinners(
        new Map([
          [1, 10],
          [2, 50],
          [3, 20],
        ]),
      ),
    ).toEqual([2]);
  });

  it("returns all tied leaders in ascending order", () => {
    expect(
      resolveWinners(
        new Map([
          [4, 50],
          [1, 10],
          [3, 50],
          [2, 50],
        ]),
      ),
    ).toEqual([2, 3, 4]);
  });
});
