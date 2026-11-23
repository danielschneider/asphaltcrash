import { describe, expect, it } from "vitest";
import { MatchClock } from "../../../src/network/match/MatchClock";
import { RemoteView } from "../../../src/network/match/RemoteView";
import { HudThrottle } from "../../../src/session/networkHud";
import type { MatchSnapshot } from "../../../src/types/game";

const FRAME_S = 1 / 60;

function snap(tick: number, timeRemainingMs: number): MatchSnapshot {
  return { tick, timeRemainingMs, cars: [], bills: [] };
}

function advanceFor(clock: MatchClock, seconds: number): number {
  let value = Number.NaN;
  const frames = Math.round(seconds / FRAME_S);
  for (let i = 0; i < frames; i += 1) {
    value = clock.advance(FRAME_S) ?? Number.NaN;
  }
  return value;
}

describe("MatchClock", () => {
  it("returns null before the first snapshot", () => {
    expect(new MatchClock().advance(FRAME_S)).toBeNull();
  });

  it("counts down at wall rate", () => {
    const clock = new MatchClock();
    clock.push(10_000);
    expect(advanceFor(clock, 1)).toBeCloseTo(9_000, 0);
  });

  it("does not raise the displayed value for a snapshot that is ahead of it", () => {
    const clock = new MatchClock();
    clock.push(10_000);
    advanceFor(clock, 1);
    const before = clock.advance(0) ?? Number.NaN;
    clock.push(9_400);
    expect(clock.advance(0)).toBeLessThanOrEqual(before);
  });

  it("keeps counting down through a 300 ms snapshot gap", () => {
    const clock = new MatchClock();
    clock.push(10_000);
    const before = advanceFor(clock, 1);
    const afterGap = advanceFor(clock, 0.3);
    expect(before - afterGap).toBeCloseTo(300, -1);
  });
});

describe("RemoteView timer", () => {
  it("keeps counting down steadily across a snapshot gap", () => {
    const view = new RemoteView();
    view.push(snap(0, 180_000));
    view.push(snap(6, 179_900));
    let previous = view.remainingMs(0) ?? Number.NaN;
    for (let frame = 0; frame < 90; frame += 1) {
      if (frame === 30) view.push(snap(12, 179_500));
      const value = view.remainingMs(FRAME_S) ?? Number.NaN;
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });
});

describe("HudThrottle", () => {
  it("fires at the configured rate", () => {
    const throttle = new HudThrottle(10);
    let fired = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      if (throttle.tick(FRAME_S)) fired += 1;
    }
    expect(Math.abs(fired - 10)).toBeLessThanOrEqual(1);
  });
});
