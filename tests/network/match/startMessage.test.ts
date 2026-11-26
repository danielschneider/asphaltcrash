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
  gameMode: "cash" as const,
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

  it("includes the selected game mode in the match start", () => {
    const msg = buildStart({ ...SETUP, gameMode: "crashfest" }, 3);
    const parsed = parseStart(JSON.parse(JSON.stringify(msg)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.cfg.gameMode).toBe("crashfest");
    expect(parsed.value.spawns[0]?.slice(0, 3)).toEqual([0, 150, 150]);
  });

  it("rejects an unknown game mode", () => {
    const raw = {
      ...buildStart(SETUP, 1),
      cfg: { ...buildStart(SETUP, 1).cfg, gameMode: "unknown" },
    };
    expect(parseStart(raw).ok).toBe(false);
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

  it("exposes typed gameMode and humanCount", () => {
    const parsed = parseStart(JSON.parse(JSON.stringify(buildStart(SETUP, 3))));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.gameMode).toBe("cash");
    expect(parsed.value.humanCount).toBe(2);
  });

  it("treats an absent humanCount as zero humans", () => {
    const msg = buildStart(SETUP, 3);
    const raw = { ...msg, cfg: { matchSeconds: 180, botDifficulty: "normal" } };
    const parsed = parseStart(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.humanCount).toBe(0);
  });

  it.each([
    ["negative", -1],
    ["fractional", 1.5],
    ["above maxCars", 99],
    ["string", "2"],
  ])("rejects a humanCount that is %s", (_label, humanCount) => {
    const msg = buildStart(SETUP, 3);
    const raw = { ...msg, cfg: { ...msg.cfg, humanCount } };
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
