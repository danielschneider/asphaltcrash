// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HostConnectivity } from "../../src/session/hostConnectivity";

describe("HostConnectivity", () => {
  it("returns null when there are no clients", () => {
    const connectivity = new HostConnectivity();
    expect(connectivity.snapshot([], 1000)).toBeNull();
  });

  it("reports poor with zero metrics for a client that never pinged", () => {
    const connectivity = new HostConnectivity();
    expect(connectivity.snapshot([1], 1000)).toEqual({
      quality: "poor",
      rttMs: 0,
      jitterMs: 0,
    });
  });

  it("reports good for recent regular pings", () => {
    const connectivity = new HostConnectivity();
    connectivity.recordPing(1, 0);
    connectivity.recordPing(1, 50);
    connectivity.recordPing(1, 100);
    expect(connectivity.snapshot([1], 120)).toEqual({
      quality: "good",
      rttMs: 20,
      jitterMs: 0,
    });
  });

  it("reports poor when silence exceeds 6000 ms", () => {
    const connectivity = new HostConnectivity();
    connectivity.recordPing(1, 0);
    expect(connectivity.snapshot([1], 6001)).toMatchObject({ quality: "poor" });
  });

  it("reports fair for moderate silence without jitter", () => {
    const connectivity = new HostConnectivity();
    connectivity.recordPing(1, 0);
    expect(connectivity.snapshot([1], 150)).toEqual({
      quality: "fair",
      rttMs: 150,
      jitterMs: 0,
    });
  });

  it("reports fair when interval jitter is within the fair threshold", () => {
    const connectivity = new HostConnectivity();
    connectivity.recordPing(1, 0);
    connectivity.recordPing(1, 50);
    connectivity.recordPing(1, 150);
    connectivity.recordPing(1, 200);
    expect(connectivity.snapshot([1], 200)).toEqual({
      quality: "fair",
      rttMs: 0,
      jitterMs: 50,
    });
  });

  it("reports poor when interval jitter exceeds the fair threshold", () => {
    const connectivity = new HostConnectivity();
    connectivity.recordPing(1, 0);
    connectivity.recordPing(1, 50);
    connectivity.recordPing(1, 250);
    connectivity.recordPing(1, 300);
    expect(connectivity.snapshot([1], 300)).toEqual({
      quality: "poor",
      rttMs: 0,
      jitterMs: 150,
    });
  });

  it("aggregates the worst quality, silence and jitter across pids", () => {
    const connectivity = new HostConnectivity();
    connectivity.recordPing(1, 0);
    connectivity.recordPing(1, 50);
    connectivity.recordPing(1, 100);
    connectivity.recordPing(2, 200);
    expect(connectivity.snapshot([1, 2], 250)).toEqual({
      quality: "fair",
      rttMs: 150,
      jitterMs: 0,
    });
  });

  it("is poor overall when any pid has never pinged", () => {
    const connectivity = new HostConnectivity();
    connectivity.recordPing(1, 0);
    connectivity.recordPing(1, 50);
    connectivity.recordPing(1, 100);
    expect(connectivity.snapshot([1, 2], 110)).toMatchObject({
      quality: "poor",
      rttMs: 10,
    });
  });

  it("ignores pids that were not requested", () => {
    const connectivity = new HostConnectivity();
    connectivity.recordPing(9, 0);
    expect(connectivity.snapshot([1], 10)).toEqual({
      quality: "poor",
      rttMs: 0,
      jitterMs: 0,
    });
  });
});
