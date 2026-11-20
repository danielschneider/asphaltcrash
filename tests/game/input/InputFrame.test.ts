import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  clampInputFrame,
} from "../../../src/game/input/InputFrame";

describe("clampInputFrame", () => {
  it("clamps throttle and steer to [-1, 1]", () => {
    const clamped = clampInputFrame({
      throttle: 3,
      steer: -7,
      action: true,
      seq: 1,
    });
    expect(clamped.throttle).toBe(1);
    expect(clamped.steer).toBe(-1);
    expect(clamped.action).toBe(true);
  });

  it("maps NaN axes to 0", () => {
    const clamped = clampInputFrame({
      throttle: Number.NaN,
      steer: Number.NaN,
      action: false,
      seq: 0,
    });
    expect(clamped.throttle).toBe(0);
    expect(clamped.steer).toBe(0);
  });

  it("keeps seq as a non-negative integer", () => {
    expect(clampInputFrame({ ...NEUTRAL_INPUT, seq: -3 }).seq).toBe(0);
    expect(clampInputFrame({ ...NEUTRAL_INPUT, seq: 4.7 }).seq).toBe(4);
    expect(clampInputFrame({ ...NEUTRAL_INPUT, seq: Number.NaN }).seq).toBe(0);
  });

  it("passes in-range values unchanged", () => {
    const frame = { throttle: 0.25, steer: -0.5, action: true, seq: 9 };
    expect(clampInputFrame(frame)).toEqual(frame);
  });
});
