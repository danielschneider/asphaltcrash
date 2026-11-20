import { describe, expect, it } from "vitest";
import { MatchSimulation } from "../../../src/game/sim/MatchSimulation";
import {
  decodeSnapshot,
  encodeSnapshot,
} from "../../../src/network/protocol/codec";
import {
  buildStart,
  makeReady,
  parseStart,
} from "../../../src/network/match/startMessage";
import { validateReady } from "../../../src/network/protocol/validate";

const SETUP = {
  seed: 1234,
  humanPlayerIds: [0, 1],
  botPlayerIds: [],
  botDifficulty: "normal" as const,
  matchSeconds: 180,
};

describe("startMessage", () => {
  it("round-trips build and parse", () => {
    const msg = buildStart(SETUP, 3);
    const parsed = parseStart(JSON.parse(JSON.stringify(msg)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.mid).toBe(3);
    expect(parsed.value.seed).toBe(1234);
    expect(parsed.value.spawns.map((s) => s[0])).toEqual([0, 1]);
  });

  it("rejects seed -1", () => {
    const raw = { ...buildStart(SETUP, 1), seed: -1 };
    expect(parseStart(raw).ok).toBe(false);
  });

  it("rejects pid 99 in spawns", () => {
    const raw = { ...buildStart(SETUP, 1), spawns: [[99, 0, 0, 0]] };
    expect(parseStart(raw).ok).toBe(false);
  });

  it("rejects matchSeconds out of range", () => {
    const raw = { ...buildStart(SETUP, 1), cfg: { matchSeconds: 0 } };
    expect(parseStart(raw).ok).toBe(false);
  });

  it("builds and validates ready for the current mid", () => {
    expect(validateReady(makeReady(7), 7).ok).toBe(true);
    expect(validateReady(makeReady(7), 8).ok).toBe(false);
  });
});

describe("snapshot end-to-end", () => {
  it("round-trips a 60-step two-human simulation snapshot", () => {
    const sim = new MatchSimulation(SETUP);
    for (let i = 0; i < 60; i += 1) {
      sim.setInput(0, { aimX: 1, aimY: 0.3, action: false, seq: i + 1 });
      sim.setInput(1, {
        aimX: 0.5,
        aimY: -0.5,
        action: i === 30,
        seq: i + 1,
      });
      sim.step();
    }
    const snapshot = sim.snapshot();
    const decoded = decodeSnapshot(encodeSnapshot(snapshot, 9));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.ackSeq).toBe(9);
    expect(decoded.value.snapshot.tick).toBe(60);
    expect(decoded.value.snapshot.cars.map((c) => c.pid)).toEqual([0, 1]);
    for (const [i, car] of decoded.value.snapshot.cars.entries()) {
      const source = snapshot.cars[i];
      expect(source).toBeDefined();
      expect(Math.abs(car.x - (source?.x ?? 0))).toBeLessThanOrEqual(0.05);
      expect(Math.abs(car.y - (source?.y ?? 0))).toBeLessThanOrEqual(0.05);
      expect(car.hp).toBe(source?.hp);
    }
  });
});
