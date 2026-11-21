import { describe, expect, it } from "vitest";
import {
  lobbyStatusText,
  type LobbySnapshot,
} from "../../src/store/lobbyStore";

const BASE: LobbySnapshot = {
  roomCode: "ABC234",
  role: "client",
  status: "ready",
  pid: 1,
  players: [],
  bots: 0,
  gameMode: "cash",
  error: null,
};

describe("lobbyStatusText", () => {
  it("returns waiting text for a ready client", () => {
    expect(lobbyStatusText(BASE)).toBe("Waiting for host");
  });

  it("returns null for the host", () => {
    expect(lobbyStatusText({ ...BASE, role: "host", pid: 0 })).toBeNull();
  });

  it("returns null for a connecting client", () => {
    expect(lobbyStatusText({ ...BASE, status: "connecting" })).toBeNull();
  });

  it("returns the error text when error is set", () => {
    expect(
      lobbyStatusText({ ...BASE, status: "error", error: "Room is full" }),
    ).toBe("Room is full");
  });
});
