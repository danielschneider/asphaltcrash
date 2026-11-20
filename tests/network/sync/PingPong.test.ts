import { describe, expect, it } from "vitest";
import {
  RttTracker,
  estimateHostOffsetMs,
  makePing,
  makePong,
  measureRttMs,
} from "../../../src/network/sync/PingPong";

describe("RttTracker", () => {
  it("returns null before any sample", () => {
    expect(new RttTracker().median()).toBeNull();
  });

  it("returns the median of the last five samples", () => {
    const tracker = new RttTracker();
    for (const sample of [100, 10, 50, 30, 20]) {
      tracker.addSample(sample);
    }
    expect(tracker.median()).toBe(30);
  });

  it("drops samples older than the window", () => {
    const tracker = new RttTracker();
    for (const sample of [1000, 1000, 10, 20, 30, 40, 50]) {
      tracker.addSample(sample);
    }
    expect(tracker.median()).toBe(30);
  });

  it("averages the middle pair for an even sample count", () => {
    const tracker = new RttTracker();
    tracker.addSample(10);
    tracker.addSample(20);
    expect(tracker.median()).toBe(15);
  });
});

describe("ping and pong", () => {
  it("builds protocol-shaped messages", () => {
    const ping = makePing(1000);
    expect(ping).toEqual({ v: 1, t: "ping", c: 1000 });
    expect(makePong(ping, 5000)).toEqual({ v: 1, t: "pong", c: 1000, h: 5000 });
  });

  it("measures rtt from the injected clock", () => {
    const ping = makePing(1000);
    const pong = makePong(ping, 5000);
    expect(measureRttMs(pong, 1080)).toBe(80);
  });

  it("estimates host offset as h - (c + rtt / 2)", () => {
    const pong = makePong(makePing(1000), 5000);
    expect(estimateHostOffsetMs(pong, 1080)).toBe(5000 - (1000 + 40));
  });
});
