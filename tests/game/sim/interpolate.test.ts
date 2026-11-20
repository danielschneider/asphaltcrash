import { describe, expect, it } from "vitest";
import { interpolateSnapshot } from "../../../src/game/sim/interpolate";
import { StateInterpolator } from "../../../src/game/sim/StateInterpolator";
import type { MatchSnapshot } from "../../../src/types/game";

function snap(tick: number, x: number, angle: number, hp = 100): MatchSnapshot {
  return {
    tick,
    timeRemainingMs: 1000 - tick,
    cars: [
      {
        pid: 0,
        x,
        y: 2 * x,
        angle,
        vx: 0,
        vy: 0,
        hp,
        flags: 0,
        cargo: 0,
        score: 0,
      },
    ],
    bills: [{ id: tick, x: 0, y: 0, value: 10 }],
  };
}

describe("interpolateSnapshot (fixed dt, alpha 0 / 0.5 / 1)", () => {
  const from = snap(10, 0, 0.5, 40);
  const to = snap(11, 100, 1.5, 90);

  it("alpha 0 returns the from state values", () => {
    const out = interpolateSnapshot(from, to, 0, 11);
    expect(out.cars[0]?.x).toBeCloseTo(0, 9);
    expect(out.cars[0]?.angle).toBeCloseTo(0.5, 9);
    expect(out.cars[0]?.hp).toBe(40);
    expect(out.timeRemainingMs).toBeCloseTo(from.timeRemainingMs, 9);
  });

  it("alpha 0.5 is the midpoint for positions and angles, discrete fields snap to the later state", () => {
    const out = interpolateSnapshot(from, to, 0.5, 11);
    expect(out.tick).toBe(11);
    expect(out.cars[0]?.x).toBeCloseTo(50, 9);
    expect(out.cars[0]?.y).toBeCloseTo(100, 9);
    expect(out.cars[0]?.angle).toBeCloseTo(1.0, 9);
    expect(out.cars[0]?.hp).toBe(90);
  });

  it("alpha 1 returns the to state values", () => {
    const out = interpolateSnapshot(from, to, 1, 11);
    expect(out.cars[0]?.x).toBeCloseTo(100, 9);
    expect(out.cars[0]?.angle).toBeCloseTo(1.5, 9);
    expect(out.cars[0]?.hp).toBe(90);
  });

  it("takes the shortest arc across the +-PI wrap", () => {
    const a = snap(0, 0, Math.PI - 0.1);
    const b = snap(1, 0, -Math.PI + 0.1);
    const mid = interpolateSnapshot(a, b, 0.5, 1).cars[0]?.angle ?? 0;
    expect(Math.abs(mid)).toBeCloseTo(Math.PI, 9);
    const quarter = interpolateSnapshot(a, b, 0.25, 1).cars[0]?.angle ?? 0;
    expect(quarter).toBeCloseTo(Math.PI - 0.05, 9);
  });

  it("does not mutate its inputs", () => {
    const before = JSON.stringify([from, to]);
    interpolateSnapshot(from, to, 0.3, 11);
    expect(JSON.stringify([from, to])).toBe(before);
  });
});

describe("StateInterpolator", () => {
  it("renders the previous state at alpha 0 and the current state at alpha 1", () => {
    const interp = new StateInterpolator(snap(0, 0, 0));
    interp.push(snap(1, 10, 0));
    expect(interp.sample(0).cars[0]?.x).toBe(0);
    expect(interp.sample(1).cars[0]?.x).toBe(10);
    expect(interp.sample(0.5).cars[0]?.x).toBeCloseTo(5, 9);
  });

  it("keeps the previous state across multiple pushes and never mutates pushed states", () => {
    const first = snap(0, 0, 0);
    const second = snap(1, 10, 0);
    const interp = new StateInterpolator(first);
    interp.push(second);
    interp.push(snap(2, 20, 0));
    expect(interp.sample(0).cars[0]?.x).toBe(10);
    expect(interp.latest.tick).toBe(2);
    expect(first.cars[0]?.x).toBe(0);
    expect(second.cars[0]?.x).toBe(10);
  });

  it("collapse makes any alpha render the latest state", () => {
    const interp = new StateInterpolator(snap(0, 0, 0));
    interp.push(snap(1, 10, 0));
    interp.collapse();
    expect(interp.sample(0.5).cars[0]?.x).toBe(10);
  });
});
