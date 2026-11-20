import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import type { MatchSnapshot } from "../../../src/types/game";
import { RemoteView } from "../../../src/network/match/RemoteView";

const DELAY_TICKS = (gameConfig.interpDelayMs * gameConfig.fixedStepHz) / 1000;

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

  it("renders the newest tick minus the 100 ms delay", () => {
    const view = new RemoteView();
    view.push(snap(0, 0, 0));
    view.push(snap(10 + DELAY_TICKS, 100, 0));
    const out = view.sampleAt(0);
    expect(out?.cars[0]?.x).toBeCloseTo(100 * (10 / (10 + DELAY_TICKS)), 6);
  });

  it("uses the shortest arc for angles", () => {
    const view = new RemoteView();
    view.push(snap(0, 0, Math.PI - 0.1));
    view.push(snap(10 + DELAY_TICKS, 0, -Math.PI + 0.1));
    const angle = view.sampleAt(0)?.cars[0]?.angle ?? 0;
    expect(Math.abs(Math.abs(angle) - Math.PI)).toBeLessThan(0.2);
  });

  it("holds the newest snapshot when only one has arrived", () => {
    const view = new RemoteView();
    view.push(snap(30, 300, 0));
    const out = view.sampleAt(0);
    expect(out?.cars[0]?.x).toBe(300);
  });
});
