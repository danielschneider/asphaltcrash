import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import {
  MS_PER_SECOND,
  msToTicks,
  secondsToMs,
  secondsToTicks,
  ticksToMs,
} from "../../../src/game/sim/time";

describe("time helpers", () => {
  it("uses fixedStepHz from gameConfig", () => {
    expect(gameConfig.fixedStepHz).toBe(60);
    expect(MS_PER_SECOND).toBe(1000);
  });

  it("converts ticks to milliseconds", () => {
    expect(ticksToMs(0)).toBe(0);
    expect(ticksToMs(60)).toBe(1000);
    expect(ticksToMs(1)).toBeCloseTo(1000 / 60, 10);
  });

  it("converts seconds to ticks and milliseconds", () => {
    expect(secondsToTicks(2.5)).toBe(150);
    expect(secondsToTicks(0)).toBe(0);
    expect(secondsToMs(2.5)).toBe(2500);
  });

  it("converts milliseconds to ticks without rounding", () => {
    expect(msToTicks(1000)).toBe(60);
    expect(msToTicks(300)).toBeCloseTo(18, 10);
  });

  it("round-trips seconds through ticks", () => {
    expect(ticksToMs(secondsToTicks(3))).toBe(3000);
  });
});
