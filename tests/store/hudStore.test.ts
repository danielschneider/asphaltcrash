import { describe, expect, it, vi } from "vitest";
import { createHudStore, type HudSnapshot } from "../../src/store/hudStore";

const SAMPLE: HudSnapshot = {
  remainingMs: 1000,
  gameMode: "cash",
  winnerPids: null,
  score: 5,
  cargo: 2,
  hp: 80,
  scores: [{ pid: 0, score: 5 }],
  feed: ["P1 hit P2"],
  paused: false,
};

describe("createHudStore", () => {
  it("keeps getSnapshot identity stable until push", () => {
    const store = createHudStore();
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.push(SAMPLE);
    const second = store.getSnapshot();
    expect(second).toBe(SAMPLE);
    expect(store.getSnapshot()).toBe(second);
  });

  it("notifies subscribers on push", () => {
    const store = createHudStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.push(SAMPLE);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createHudStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.push(SAMPLE);
    expect(listener).not.toHaveBeenCalled();
  });
});
