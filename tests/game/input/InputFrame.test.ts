import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  clampInputFrame,
} from "../../../src/game/input/InputFrame";

describe("clampInputFrame", () => {
  it("clamps each aim axis to [-1, 1]", () => {
    const clamped = clampInputFrame({
      aimX: 3,
      aimY: -7,
      action: true,
      seq: 1,
    });
    expect(clamped.aimX).toBeCloseTo(1 / Math.hypot(1, 1));
    expect(clamped.aimY).toBeCloseTo(-1 / Math.hypot(1, 1));
    expect(clamped.action).toBe(true);
  });

  it("keeps a diagonal aim inside the unit circle", () => {
    const clamped = clampInputFrame({
      aimX: 0.9,
      aimY: 0.9,
      action: false,
      seq: 1,
    });
    expect(Math.hypot(clamped.aimX, clamped.aimY)).toBeCloseTo(1);
  });

  it("maps NaN axes to 0", () => {
    const clamped = clampInputFrame({
      aimX: Number.NaN,
      aimY: Number.NaN,
      action: false,
      seq: 0,
    });
    expect(clamped.aimX).toBe(0);
    expect(clamped.aimY).toBe(0);
  });

  it("keeps seq as a non-negative integer", () => {
    expect(clampInputFrame({ ...NEUTRAL_INPUT, seq: -3 }).seq).toBe(0);
    expect(clampInputFrame({ ...NEUTRAL_INPUT, seq: 4.7 }).seq).toBe(4);
    expect(clampInputFrame({ ...NEUTRAL_INPUT, seq: Number.NaN }).seq).toBe(0);
  });

  it("passes in-range aim unchanged", () => {
    const frame = { aimX: 0.25, aimY: -0.5, action: true, seq: 9 };
    expect(clampInputFrame(frame)).toEqual(frame);
  });
});
