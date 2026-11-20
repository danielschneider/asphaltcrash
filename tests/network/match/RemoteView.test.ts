import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import type { MatchSnapshot } from "../../../src/types/game";
import { RemoteView } from "../../../src/network/match/RemoteView";

const DELAY_TICKS = (gameConfig.interpDelayMs * gameConfig.fixedStepHz) / 1000;
const FRAME_S = 1 / 60;
const STRIDE = gameConfig.fixedStepHz / gameConfig.snapshotHz;
const X_PER_TICK = 10;

function snap(tick: number, angle = 0): MatchSnapshot {
  return {
    tick,
    timeRemainingMs: 1000,
    cars: [
      {
        pid: 0,
        x: tick * X_PER_TICK,
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

function renderTick(view: RemoteView, dt: number): number {
  const x = view.advance(dt)?.cars[0]?.x ?? Number.NaN;
  return x / X_PER_TICK;
}

describe("RemoteView", () => {
  it("returns null when empty", () => {
    expect(new RemoteView().advance(FRAME_S)).toBeNull();
  });

  it("snaps to the delayed target on the first frame", () => {
    const view = new RemoteView();
    view.push(snap(0));
    view.push(snap(100));
    expect(renderTick(view, 0)).toBeCloseTo(100 - DELAY_TICKS, 6);
  });

  it("advances the render tick every frame, not only on new snapshots", () => {
    const view = new RemoteView();
    view.push(snap(0));
    view.push(snap(100));
    const t0 = renderTick(view, 0);
    const t1 = renderTick(view, FRAME_S);
    const t2 = renderTick(view, FRAME_S);
    expect(t1).toBeGreaterThan(t0);
    expect(t2).toBeGreaterThan(t1);
    expect(t1 - t0).toBeLessThan(gameConfig.fixedStepHz * FRAME_S + 0.01);
  });

  it("eases toward the target on moderate drift instead of jumping", () => {
    const view = new RemoteView();
    view.push(snap(0));
    view.push(snap(100));
    const before = renderTick(view, 0);
    view.push(snap(100 + STRIDE));
    const after = renderTick(view, FRAME_S);
    const target = 100 + STRIDE - DELAY_TICKS;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(target);
    expect(after - before).toBeLessThan(1.5);
  });

  it("tracks a steady 20 Hz stream within a fraction of a tick", () => {
    const view = new RemoteView();
    view.push(snap(0));
    let newestTick = 0;
    let lastTick = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      if (frame % 3 === 0) {
        newestTick += STRIDE;
        view.push(snap(newestTick));
      }
      lastTick = renderTick(view, FRAME_S);
    }
    expect(Math.abs(lastTick - (newestTick - DELAY_TICKS))).toBeLessThan(1);
  });

  it("snaps when the render tick is far from target", () => {
    const view = new RemoteView();
    view.push(snap(0));
    view.push(snap(100));
    renderTick(view, 0);
    view.push(snap(1000));
    expect(renderTick(view, 0)).toBeCloseTo(1000 - DELAY_TICKS, 6);
  });

  it("clamps the render tick to the buffer bounds", () => {
    const view = new RemoteView();
    view.push(snap(50));
    expect(renderTick(view, 0)).toBe(50);
    expect(renderTick(view, 1)).toBe(50);
    view.push(snap(60));
    for (let i = 0; i < 600; i += 1) renderTick(view, FRAME_S);
    const settled = renderTick(view, FRAME_S);
    expect(settled).toBeLessThanOrEqual(60);
    expect(settled).toBeGreaterThanOrEqual(50);
  });

  it("does not run past the newest snapshot on a large frame delta", () => {
    const view = new RemoteView();
    view.push(snap(0));
    view.push(snap(100));
    renderTick(view, 0);
    for (let i = 0; i < 10; i += 1) {
      expect(renderTick(view, 0.1)).toBeLessThanOrEqual(100);
    }
  });

  it("uses the shortest arc for angles", () => {
    const view = new RemoteView();
    view.push(snap(0, Math.PI - 0.1));
    view.push(snap(10 + DELAY_TICKS, -Math.PI + 0.1));
    const angle = view.advance(0)?.cars[0]?.angle ?? 0;
    expect(Math.abs(Math.abs(angle) - Math.PI)).toBeLessThan(0.2);
  });

  it("holds the newest snapshot when only one has arrived", () => {
    const view = new RemoteView();
    view.push(snap(30));
    expect(renderTick(view, FRAME_S)).toBe(30);
  });
});
