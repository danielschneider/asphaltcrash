import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import type { MatchSnapshot } from "../../../src/types/game";
import {
  decodeInput,
  decodeSnapshot,
  encodeAngle,
  encodeInput,
  encodeSnapshot,
  fromSnapMessage,
  toSnapMessage,
} from "../../../src/network/protocol/codec";
import {
  createInvalidCounter,
  validateInputPayload,
  validateHello,
} from "../../../src/network/protocol/validate";

function makeSnapshot(carCount: number = gameConfig.maxCars): MatchSnapshot {
  const cars = Array.from({ length: carCount }, (_, pid) => ({
    pid,
    x: 123.4 + pid * 17.3,
    y: 987.6 - pid * 9.1,
    angle: 0.1234 * (pid - 3),
    vx: 120 - pid * 11,
    vy: -40 + pid * 7,
    hp: 100 - pid * 5,
    flags: pid % 5,
    cargo: pid % 6,
    score: 1000 + pid * 35,
  }));
  const bills = Array.from({ length: 12 }, (_, i) => ({
    id: 500 + i,
    x: 40 + i * 180,
    y: 60 + i * 110,
    value: ([10, 20, 50] as const)[i % 3] ?? 10,
  }));
  return { tick: 12345, timeRemainingMs: 90500, cars, bills };
}

describe("codec snapshot round trip", () => {
  it("restores values within quantization bounds", () => {
    const original = makeSnapshot();
    const decoded = decodeSnapshot(encodeSnapshot(original, 7));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.ackSeq).toBe(7);
    expect(decoded.value.snapshot.tick).toBe(original.tick);
    expect(decoded.value.snapshot.timeRemainingMs).toBe(
      original.timeRemainingMs,
    );
    original.cars.forEach((car, i) => {
      const got = decoded.value.snapshot.cars[i];
      expect(got).toBeDefined();
      if (!got) return;
      expect(Math.abs(got.x - car.x)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(got.y - car.y)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(got.angle - car.angle)).toBeLessThanOrEqual(0.001);
      expect(got.vx).toBe(Math.round(car.vx));
      expect(got.vy).toBe(Math.round(car.vy));
      expect(got.hp).toBe(car.hp);
      expect(got.flags).toBe(car.flags);
      expect(got.cargo).toBe(car.cargo);
      expect(got.score).toBe(car.score);
    });
    original.bills.forEach((bill, i) => {
      expect(decoded.value.snapshot.bills[i]).toEqual({
        id: bill.id,
        x: Math.round(bill.x),
        y: Math.round(bill.y),
        value: bill.value,
      });
    });
  });

  it("round-trips pre-rounded input exactly", () => {
    const snapshot: MatchSnapshot = {
      tick: 1,
      timeRemainingMs: 0,
      cars: [
        {
          pid: 0,
          x: 10.5,
          y: -20.3,
          angle: 1.571,
          vx: 5,
          vy: -6,
          hp: 0,
          flags: 0,
          cargo: 0,
          score: 0,
        },
      ],
      bills: [{ id: 3, x: 4, y: 5, value: 50 }],
    };
    const decoded = decodeSnapshot(encodeSnapshot(snapshot, 0));
    expect(decoded).toEqual({ ok: true, value: { ackSeq: 0, snapshot } });
  });

  it("clamps angles to the wire range", () => {
    const snapshot = makeSnapshot();
    const wild: MatchSnapshot = {
      ...snapshot,
      cars: [{ ...snapshot.cars[0]!, angle: 0.5 }],
    };
    const decoded = decodeSnapshot(encodeSnapshot(wild, 0));
    expect(
      decoded.ok &&
        Math.abs(decoded.value.snapshot.cars[0]!.angle - 0.5) < 0.001,
    ).toBe(true);
  });

  // NETWORK_PROTOCOL 4.2.3 estimate is pending owner decision; this test guards the measured worst case at maxCars.
  it("keeps the worst case under 1200 bytes at maxCars with 12 bills", () => {
    const worst = makeSnapshot(gameConfig.maxCars);
    const size = encodeSnapshot(worst, 2147483647).length;
    expect(size).toBeLessThan(1200);
  });
});

describe("codec snapshot rejection", () => {
  const cases: Array<[string, string, string]> = [
    ["bad json", "{not json", "json"],
    [
      "wrong t",
      JSON.stringify({ v: 1, t: "in", s: 1, th: 0, st: 0, a: 0 }),
      "wrong-type",
    ],
    [
      "pid out of range",
      JSON.stringify({
        v: 1,
        t: "snap",
        k: 1,
        ak: 0,
        tm: 0,
        cars: [[gameConfig.maxCars, 0, 0, 0, 0, 0, 100, 0, 0, 0]],
        bills: [],
      }),
      "pid-range",
    ],
    [
      "bad version",
      JSON.stringify({
        v: 2,
        t: "snap",
        k: 1,
        ak: 0,
        tm: 0,
        cars: [],
        bills: [],
      }),
      "version",
    ],
  ];
  it.each(cases)("rejects %s with a reason", (_name, text, reason) => {
    const result = decodeSnapshot(text);
    expect(result).toEqual({ ok: false, reason });
  });
});

describe("codec fromSnapMessage", () => {
  it("maps a wire snap to a MatchSnapshot without touching the source", () => {
    const source = makeSnapshot(3);
    const wire = toSnapMessage(source, 4);
    const mapped = fromSnapMessage(wire);
    expect(mapped.tick).toBe(source.tick);
    expect(mapped.cars.map((c) => c.pid)).toEqual([0, 1, 2]);
    expect(mapped.cars[1]?.score).toBe(source.cars[1]?.score);
    expect(mapped.bills).toHaveLength(12);
    expect(wire.cars[0]?.[3]).toBe(encodeAngle(source.cars[0]?.angle ?? 0));
  });
});

describe("codec input", () => {
  it("round-trips in-range input", () => {
    const decoded = decodeInput(
      encodeInput({ throttle: 1, steer: -0.5, action: true, seq: 42 }),
    );
    expect(decoded).toEqual({
      ok: true,
      value: { throttle: 1, steer: -0.5, action: true, seq: 42 },
    });
  });

  it("rejects out-of-range throttle without throwing", () => {
    const text = JSON.stringify({ v: 1, t: "in", s: 1, th: 101, st: 0, a: 0 });
    expect(decodeInput(text)).toEqual({ ok: false, reason: "range" });
  });

  it("rejects non-object and unknown types", () => {
    expect(decodeInput("null").ok).toBe(false);
    expect(decodeInput("[]").ok).toBe(false);
    expect(decodeInput(JSON.stringify({ v: 1, t: "zzz" }))).toEqual({
      ok: false,
      reason: "wrong-type",
    });
  });
});

describe("validate", () => {
  it("checks input ranges", () => {
    expect(
      validateInputPayload({ v: 1, t: "in", s: 0, th: -100, st: 100, a: 1 }).ok,
    ).toBe(true);
    expect(
      validateInputPayload({ v: 1, t: "in", s: 0, th: 0, st: -101, a: 0 }),
    ).toEqual({ ok: false, reason: "range" });
    expect(
      validateInputPayload({ v: 1, t: "in", s: 0, th: 0, st: 0, a: 2 }).ok,
    ).toBe(false);
    expect(
      validateInputPayload({ v: 1, t: "in", s: -1, th: 0, st: 0, a: 0 }).ok,
    ).toBe(false);
  });

  it("validates hello name and token", () => {
    expect(
      validateHello({ v: 1, name: "  Ann  ", token: "abcdefghij123456" }),
    ).toEqual({
      ok: true,
      value: { name: "Ann", token: "abcdefghij123456" },
    });
    expect(
      validateHello({ v: 1, name: "", token: "abcdefghij123456" }).ok,
    ).toBe(false);
    expect(
      validateHello({ v: 1, name: "x".repeat(17), token: "abcdefghij123456" })
        .ok,
    ).toBe(false);
    expect(validateHello({ v: 1, name: "Ann", token: "short" }).ok).toBe(false);
  });

  it("disconnects after three invalid messages within 5 s", () => {
    const counter = createInvalidCounter();
    counter.record("p", 0);
    counter.record("p", 1000);
    expect(counter.shouldDisconnect("p", 1000)).toBe(false);
    counter.record("p", 2000);
    expect(counter.count("p")).toBe(3);
    expect(counter.shouldDisconnect("p", 2000)).toBe(true);
  });

  it("uses a 5000 ms boundary", () => {
    const counter = createInvalidCounter();
    counter.record("p", 0);
    counter.record("p", 1);
    counter.record("p", 2);
    expect(counter.shouldDisconnect("p", 5000)).toBe(true);
    const late = createInvalidCounter();
    late.record("q", 0);
    late.record("q", 1);
    late.record("q", 5001);
    expect(late.shouldDisconnect("q", 5001)).toBe(false);
  });
});
