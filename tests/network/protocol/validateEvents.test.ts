import { describe, expect, it } from "vitest";
import {
  validateEventPayload,
  validateMessage,
  validateReady,
} from "../../../src/network/protocol/validate";

function ev(k: string, d: unknown): Record<string, unknown> {
  return { v: 1, t: "ev", k, d };
}

const FIELD_D = { ok: false, reason: "field:d" };

describe("validateEventPayload", () => {
  it.each([
    ["pick", [0, 5, 10], { ok: true }],
    ["drop", [1, 3], { ok: true }],
    ["deliv", [1, 100], { ok: true }],
    ["hit", [0, 1, 2.5], { ok: true }],
    ["kill", [0, 1], { ok: true }],
    ["respawn", [0, 10, 20, 1.5], { ok: true }],
    ["billNew", [7, 10, 20, 50], { ok: true }],
    ["timer", [5000], { ok: true }],
  ])("accepts a valid %s payload", (k, d) => {
    const result = validateEventPayload(ev(k, d));
    expect(result).toEqual({
      ok: true,
      value: { v: 1, t: "ev", k, d },
    });
  });

  it.each([
    ["pick", [0, 5], "wrong arity"],
    ["pick", [0, 5, 15], "bill value outside BILL_VALUES"],
    ["drop", [1], "wrong arity"],
    ["drop", [1, 6], "count above cargoCapacity (5)"],
    ["deliv", [1, 2, 3], "wrong arity"],
    ["deliv", [16, 100], "pid above maxCars-1"],
    ["hit", [0, 1], "wrong arity"],
    ["hit", [0, 1, Number.NaN], "non-finite impulse"],
    ["kill", [0], "wrong arity"],
    ["kill", [-1, 1], "negative pid"],
    ["respawn", [0, 10, 20], "wrong arity"],
    ["respawn", [0, 100001, 20, 1], "x beyond POS_LIMIT"],
    ["billNew", [7, 10, 20], "wrong arity"],
    ["billNew", [7, 10, 20, 30], "bill value outside BILL_VALUES"],
    ["timer", [], "wrong arity"],
    ["timer", [-1], "negative remainingMs"],
  ])("rejects %s payload with invalid data (%s)", (k, d) => {
    expect(validateEventPayload(ev(k, d))).toEqual(FIELD_D);
  });

  it("rejects an unknown event kind", () => {
    expect(validateEventPayload(ev("boom", [1]))).toEqual({
      ok: false,
      reason: "field:k",
    });
  });

  it("rejects a non-array d", () => {
    expect(validateEventPayload(ev("timer", 5000))).toEqual(FIELD_D);
  });

  it("rejects wrong version and wrong type", () => {
    expect(validateEventPayload({ ...ev("timer", [1]), v: 2 })).toEqual({
      ok: false,
      reason: "version",
    });
    expect(validateEventPayload({ ...ev("timer", [1]), t: "in" })).toEqual({
      ok: false,
      reason: "wrong-type",
    });
  });
});

describe("envelope validators", () => {
  it("accepts a welcome envelope and rejects a bad player tuple", () => {
    const lobby = {
      players: [[0, "alice", "h", true]],
      bots: 0,
      cfg: { gameMode: "cash" },
    };
    expect(validateMessage({ v: 1, t: "welcome", pid: 0, lobby }).ok).toBe(
      true,
    );
    expect(
      validateMessage({
        v: 1,
        t: "welcome",
        pid: 0,
        lobby: { ...lobby, players: [[0, "alice", "x", true]] },
      }),
    ).toEqual({ ok: false, reason: "field:player" });
  });

  it("accepts a reject envelope and rejects an unknown reason", () => {
    expect(validateMessage({ v: 1, t: "reject", reason: "full" })).toEqual({
      ok: true,
      value: { v: 1, t: "reject", reason: "full" },
    });
    expect(validateMessage({ v: 1, t: "reject", reason: "nope" })).toEqual({
      ok: false,
      reason: "field:reason",
    });
  });

  it("validates ready envelope via dispatcher and expected mid", () => {
    const ready = { v: 1, t: "ready", mid: 3 };
    expect(validateMessage(ready)).toEqual({
      ok: true,
      value: { v: 1, t: "ready", mid: 3 },
    });
    expect(validateReady(ready, 3).ok).toBe(true);
    expect(validateReady(ready, 4)).toEqual({
      ok: false,
      reason: "mid-mismatch",
    });
    expect(validateReady({ v: 1, t: "ready", mid: -1 }, 3)).toEqual({
      ok: false,
      reason: "field:mid",
    });
  });

  it("accepts an end envelope and rejects malformed scores", () => {
    const end = {
      v: 1,
      t: "end",
      mid: 1,
      scores: [[0, 1, 2, 3]],
      winners: [0],
    };
    expect(validateMessage(end).ok).toBe(true);
    expect(validateMessage(end).ok).toBe(true);
    expect(validateMessage({ ...end, scores: [[0, 1, 2]] })).toEqual({
      ok: false,
      reason: "field:scores",
    });
    expect(validateMessage({ ...end, winners: [-1] })).toEqual({
      ok: false,
      reason: "field:winners",
    });
  });
});
