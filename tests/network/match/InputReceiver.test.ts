import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT } from "../../../src/game/input/InputFrame";
import { InputReceiver } from "../../../src/network/match/InputReceiver";
import { validateInputPayload } from "../../../src/network/protocol/validate";

function msg(s: number, th: number, st: number, a: 0 | 1 = 0) {
  return { s, th, st, a };
}

describe("InputReceiver", () => {
  it("drops old and duplicate seq per pid", () => {
    const recv = new InputReceiver();
    expect(recv.accept(0, msg(5, 100, 0), 0)).toBe(true);
    expect(recv.accept(0, msg(3, -100, 0), 10)).toBe(false);
    expect(recv.accept(0, msg(5, -100, 0), 10)).toBe(false);
    expect(recv.latest(0, 10).throttle).toBe(1);
    expect(recv.accept(1, msg(1, 100, 0), 10)).toBe(true);
  });

  it("holds the last input zero-order until the 500 ms timeout", () => {
    const recv = new InputReceiver();
    recv.accept(0, msg(1, 50, -100, 1), 1000);
    const held = recv.latest(0, 1499);
    expect(held).toEqual({ throttle: 0.5, steer: -1, action: true, seq: 1 });
    expect(recv.latest(0, 1500)).toEqual(NEUTRAL_INPUT);
  });

  it("returns neutral for unknown pid", () => {
    expect(new InputReceiver().latest(3, 0)).toEqual(NEUTRAL_INPUT);
  });

  it("maps wire th/st to -1..1 and seq to seq", () => {
    const recv = new InputReceiver();
    recv.accept(2, msg(9, 100, -100), 0);
    expect(recv.latest(2, 0)).toEqual({
      throttle: 1,
      steer: -1,
      action: false,
      seq: 9,
    });
  });

  it("rejects out-of-range th through validateInputPayload", () => {
    const bad = validateInputPayload({
      v: 1,
      t: "in",
      s: 1,
      th: 101,
      st: 0,
      a: 0,
    });
    expect(bad.ok).toBe(false);
    const good = validateInputPayload({
      v: 1,
      t: "in",
      s: 1,
      th: -100,
      st: 100,
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
