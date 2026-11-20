import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import type { MatchSnapshot } from "../../../src/types/game";
import {
  HOST_STEP_MS,
  RemoteView,
} from "../../../src/network/match/RemoteView";

function snap(tick: number, x: number, angle: number): MatchSnapshot {
  return {
    tick,
    timeRemainingMs: 1000,
    cars: [
      {
        pid: 0,
        x,
        y: 0,
        angle,
        vx: 0,
        vy: 0,
        hp: 100,
        flags: 0,
        cargo: 0,
        score: 0,
      },
    ],
    bills: [],
  };
}

describe("RemoteView", () => {
  it("returns null when empty", () => {
    expect(new RemoteView().sampleAt(1000)).toBeNull();
  });

  it("interpolates at the midpoint of two snapshots", () => {
    const view = new RemoteView();
    view.push(snap(0, 0, 0));
    view.push(snap(10, 100, 0));
    const renderTick = 5;
    const hostNow = renderTick * HOST_STEP_MS + gameConfig.interpDelayMs;
    const out = view.sampleAt(hostNow);
    expect(out?.cars[0]?.x).toBeCloseTo(50, 6);
  });

  it("uses the shortest arc for angles", () => {
    const view = new RemoteView();
    view.push(snap(0, 0, Math.PI - 0.1));
    view.push(snap(10, 0, -Math.PI + 0.1));
    const hostNow = 5 * HOST_STEP_MS + gameConfig.interpDelayMs;
    const angle = view.sampleAt(hostNow)?.cars[0]?.angle ?? 0;
    expect(Math.abs(Math.abs(angle) - Math.PI)).toBeLessThan(1e-6);
  });

  it("maps host time with 100 ms render delay", () => {
    const view = new RemoteView();
    view.push(snap(0, 0, 0));
    view.push(snap(60, 600, 0));
    const out = view.sampleAt(gameConfig.interpDelayMs + 10 * HOST_STEP_MS);
    expect(out?.tick).toBe(10);
  });
});
