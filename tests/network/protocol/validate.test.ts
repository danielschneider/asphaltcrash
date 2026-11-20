import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import {
  INVALID_DISCONNECT_COUNT,
  INVALID_WINDOW_MS,
  createInvalidCounter,
  validateHello,
  validateInputPayload,
  validateMessage,
  validateSnapPayload,
} from "../../../src/network/protocol/validate";

const VALID_TOKEN = "abcdefghij123456";

function input(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { v: 1, t: "in", s: 1, ax: 0, ay: 0, a: 0, ...overrides };
}

function snap(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    v: 1,
    t: "snap",
    k: 10,
    ak: 0,
    tm: 1000,
    cars: [],
    bills: [],
    ...overrides,
  };
}

describe("validateInputPayload", () => {
  it("accepts the boundary values -100 and 100", () => {
    expect(validateInputPayload(input({ ax: -100, ay: 100 })).ok).toBe(true);
  });

  it("rejects aim components outside -100..100", () => {
    expect(validateInputPayload(input({ ax: 101 }))).toEqual({
      ok: false,
      reason: "range",
    });
    expect(validateInputPayload(input({ ay: -101 })).ok).toBe(false);
  });

  it("rejects non-integer aim and wrong action values", () => {
    expect(validateInputPayload(input({ ax: 1.5 })).ok).toBe(false);
    expect(validateInputPayload(input({ a: 2 })).ok).toBe(false);
  });

  it("rejects wrong version and non-object payloads", () => {
    expect(validateInputPayload(input({ v: 2 }))).toEqual({
      ok: false,
      reason: "version",
    });
    expect(validateInputPayload([]).ok).toBe(false);
  });
});

describe("validateSnapPayload", () => {
  it("rejects more cars than maxCars", () => {
    const car = [0, 0, 0, 0, 0, 0, 100, 0, 0, 0];
    const tooMany = gameConfig.maxCars + 1;
    const result = validateSnapPayload(
      snap({ cars: Array(tooMany).fill(car) }),
    );
    expect(result).toEqual({ ok: false, reason: "field:cars" });
  });

  it("accepts a pid at the top of the maxCars range and rejects maxCars", () => {
    const car = (pid: number): number[] => [pid, 0, 0, 0, 0, 0, 100, 0, 0, 0];
    expect(
      validateSnapPayload(snap({ cars: [car(gameConfig.maxCars - 1)] })).ok,
    ).toBe(true);
    expect(
      validateSnapPayload(snap({ cars: [car(gameConfig.maxCars)] })),
    ).toEqual({ ok: false, reason: "pid-range" });
  });

  it("rejects more bills than maxBillsOnField (12)", () => {
    const bill = [1, 0, 0, 10];
    const result = validateSnapPayload(snap({ bills: Array(13).fill(bill) }));
    expect(result).toEqual({ ok: false, reason: "field:bills" });
  });

  it("rejects a car with hp above 100", () => {
    const car = [0, 0, 0, 0, 0, 0, 101, 0, 0, 0];
    expect(validateSnapPayload(snap({ cars: [car] })).ok).toBe(false);
  });

  it("rejects a bill with an unknown value", () => {
    expect(validateSnapPayload(snap({ bills: [[1, 0, 0, 7]] })).ok).toBe(false);
  });

  it("accepts an empty snapshot", () => {
    expect(validateSnapPayload(snap()).ok).toBe(true);
  });
});

describe("validateHello", () => {
  function hello(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return { v: 1, name: "Ann", token: VALID_TOKEN, ...overrides };
  }

  it("accepts a trimmed name of 1..16 characters and a 16-char token", () => {
    expect(validateHello(hello({ name: "  Ann  " }))).toEqual({
      ok: true,
      value: { name: "Ann", token: VALID_TOKEN },
    });
    expect(validateHello(hello({ name: "a".repeat(16) })).ok).toBe(true);
  });

  it("rejects empty and over-long names", () => {
    expect(validateHello(hello({ name: "   " }))).toEqual({
      ok: false,
      reason: "field:name",
    });
    expect(validateHello(hello({ name: "a".repeat(17) }))).toEqual({
      ok: false,
      reason: "field:name",
    });
  });

  it("rejects names containing control characters", () => {
    expect(validateHello(hello({ name: "Ann\u0007" })).ok).toBe(false);
  });

  it("rejects tokens that are not 16 alphanumeric characters", () => {
    expect(validateHello(hello({ token: "short" }))).toEqual({
      ok: false,
      reason: "field:token",
    });
    expect(validateHello(hello({ token: "abcdefghij12345!" })).ok).toBe(false);
    expect(validateHello(hello({ token: 123 })).ok).toBe(false);
  });

  it("rejects a wrong protocol version", () => {
    expect(validateHello(hello({ v: 2 }))).toEqual({
      ok: false,
      reason: "version",
    });
  });
});

describe("createInvalidCounter", () => {
  it("disconnects on the third invalid message within 5 s", () => {
    const counter = createInvalidCounter();
    counter.record("peer", 0);
    counter.record("peer", 1000);
    expect(counter.shouldDisconnect("peer", 1000)).toBe(false);
    counter.record("peer", 2000);
    expect(counter.count("peer")).toBe(3);
    expect(counter.shouldDisconnect("peer", 2000)).toBe(true);
  });

  it("does not disconnect when the third message is outside the 5 s window", () => {
    const counter = createInvalidCounter();
    counter.record("peer", 0);
    counter.record("peer", 1000);
    counter.record("peer", INVALID_WINDOW_MS + 1);
    expect(counter.shouldDisconnect("peer", INVALID_WINDOW_MS + 1)).toBe(false);
  });

  it("treats exactly 5000 ms as inside the window", () => {
    const counter = createInvalidCounter();
    counter.record("peer", 0);
    counter.record("peer", 1);
    counter.record("peer", INVALID_WINDOW_MS);
    expect(counter.shouldDisconnect("peer", INVALID_WINDOW_MS)).toBe(true);
  });

  it("keeps counts per peer", () => {
    const counter = createInvalidCounter();
    for (let i = 0; i < INVALID_DISCONNECT_COUNT - 1; i += 1) {
      counter.record("a", i);
    }
    expect(counter.shouldDisconnect("a", 0)).toBe(false);
    expect(counter.count("b")).toBe(0);
    expect(counter.shouldDisconnect("b", 0)).toBe(false);
  });
});

describe("validateMessage", () => {
  it("rejects an unknown message type with unknown-type", () => {
    expect(validateMessage({ v: 1, t: "teleport" })).toEqual({
      ok: false,
      reason: "unknown-type",
    });
  });

  it("reports known control types as not-implemented", () => {
    expect(
      validateMessage({ v: 1, t: "hello", name: "a", token: VALID_TOKEN }),
    ).toEqual({
      ok: false,
      reason: "not-implemented",
    });
  });

  it("rejects a missing or non-string type", () => {
    expect(validateMessage({ v: 1 })).toEqual({ ok: false, reason: "field:t" });
    expect(validateMessage({ v: 1, t: 5 })).toEqual({
      ok: false,
      reason: "field:t",
    });
  });

  it("dispatches a valid input message", () => {
    expect(validateMessage(input()).ok).toBe(true);
  });
});
