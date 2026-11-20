import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT } from "../../../src/game/input/InputFrame";
import { InputReceiver } from "../../../src/network/match/InputReceiver";
import { validateInputPayload } from "../../../src/network/protocol/validate";

function msg(s: number, ax: number, ay: number, a: 0 | 1 = 0) {
  return { s, ax, ay, a };
}

describe("InputReceiver", () => {
  it("drops old and duplicate seq per pid", () => {
    const recv = new InputReceiver();
    expect(recv.accept(0, msg(5, 100, 0), 0)).toBe(true);
    expect(recv.accept(0, msg(3, -100, 0), 10)).toBe(false);
    expect(recv.accept(0, msg(5, -100, 0), 10)).toBe(false);
    expect(recv.latest(0, 10).aimX).toBe(1);
    expect(recv.accept(1, msg(1, 100, 0), 10)).toBe(true);
  });

  it("holds the last input zero-order until the 500 ms timeout", () => {
    const recv = new InputReceiver();
    recv.accept(0, msg(1, 50, -100, 1), 1000);
    const held = recv.latest(0, 1499);
    expect(held).toEqual({
      aimX: 0.5 / Math.hypot(0.5, 1),
      aimY: -1 / Math.hypot(0.5, 1),
      action: true,
      seq: 1,
    });
    expect(recv.latest(0, 1500)).toEqual(NEUTRAL_INPUT);
  });

  it("returns neutral for unknown pid", () => {
    expect(new InputReceiver().latest(3, 0)).toEqual(NEUTRAL_INPUT);
  });

  it("maps wire ax/ay to -1..1 and seq to seq", () => {
    const recv = new InputReceiver();
    recv.accept(2, msg(9, 100, -100), 0);
    expect(recv.latest(2, 0).aimX).toBeCloseTo(Math.SQRT1_2);
    expect(recv.latest(2, 0).aimY).toBeCloseTo(-Math.SQRT1_2);
    expect(recv.latest(2, 0).seq).toBe(9);
  });

  it("rejects out-of-range ax through validateInputPayload", () => {
    const bad = validateInputPayload({
      v: 1,
      t: "in",
      s: 1,
      ax: 101,
      ay: 0,
      a: 0,
    });
    expect(bad.ok).toBe(false);
    const good = validateInputPayload({
      v: 1,
      t: "in",
      s: 1,
      ax: -100,
      ay: 100,
      a: 1,
    });
    expect(good.ok).toBe(true);
  });

  it("dropPid forgets seq and input state", () => {
    const recv = new InputReceiver();
    recv.accept(0, msg(4, 100, 0), 0);
    recv.dropPid(0);
    expect(recv.latest(0, 0)).toEqual(NEUTRAL_INPUT);
    expect(recv.accept(0, msg(1, 0, 0), 0)).toBe(true);
  });
});
