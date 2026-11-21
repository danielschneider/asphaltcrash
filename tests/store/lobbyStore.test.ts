// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createLobbyStore, reasonToMessage } from "../../src/store/lobbyStore";

describe("reasonToMessage", () => {
  it.each([
    ["version", "Version mismatch"],
    ["full", "Room is full"],
    ["invalid", "Invalid name"],
    ["running", "Match already running"],
    ["timeout", "Connection failed"],
    ["unknown-reason", "Connection rejected"],
  ])("maps %s to %s", (reason, message) => {
    expect(reasonToMessage(reason)).toBe(message);
  });
});

describe("createLobbyStore", () => {
  it("starts idle with no room", () => {
    const store = createLobbyStore();
    expect(store.getSnapshot()).toEqual({
      roomCode: null,
      role: "none",
      status: "idle",
      pid: null,
      players: [],
      bots: 0,
      gameMode: "cash",
      error: null,
    });
  });

  it("merges patches and notifies subscribers", () => {
    const store = createLobbyStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ role: "host", roomCode: "ABCDEF", status: "ready" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({
      role: "host",
      roomCode: "ABCDEF",
      status: "ready",
      pid: null,
    });
  });

  it("reset restores the empty snapshot and notifies", () => {
    const store = createLobbyStore();
    store.set({ role: "client", error: "Room is full" });
    const listener = vi.fn();
    store.subscribe(listener);
    store.reset();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().role).toBe("none");
    expect(store.getSnapshot().error).toBeNull();
  });

  it("stops notifying after unsubscribe", () => {
    const store = createLobbyStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set({ status: "error" });
    expect(listener).not.toHaveBeenCalled();
  });
});
