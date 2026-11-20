// @vitest-environment node
import { describe, expect, it } from "vitest";
import { gameConfig } from "../../src/config/gameConfig";
import {
  MAX_LOBBY_BOTS,
  clampBotCount,
  rosterWithBots,
  totalCarCount,
} from "../../src/session/lobbyRoster";

describe("clampBotCount", () => {
  it("allows 0 to maxCars - maxHumans", () => {
    expect(MAX_LOBBY_BOTS).toBe(gameConfig.maxCars - gameConfig.maxHumans);
    expect(clampBotCount(0)).toBe(0);
    expect(clampBotCount(12)).toBe(12);
  });

  it("clamps out-of-range values", () => {
    expect(clampBotCount(-3)).toBe(0);
    expect(clampBotCount(13)).toBe(12);
    expect(clampBotCount(99)).toBe(12);
  });

  it("rounds fractional values and treats NaN as 0", () => {
    expect(clampBotCount(2.6)).toBe(3);
    expect(clampBotCount(Number.NaN)).toBe(0);
  });
});

describe("rosterWithBots", () => {
  const humans = [
    { pid: 0, name: "Alice" },
    { pid: 1, name: "Bob" },
  ];

  it("lists humans first, then CPU rows in order", () => {
    expect(rosterWithBots(humans, 2).map((row) => row.label)).toEqual([
      "0: Alice",
      "1: Bob",
      "CPU 1",
      "CPU 2",
    ]);
  });

  it("returns only humans when bots is 0", () => {
    expect(rosterWithBots(humans, 0)).toHaveLength(2);
  });

  it("clamps the CPU row count", () => {
    expect(rosterWithBots([], 50)).toHaveLength(12);
  });
});

describe("totalCarCount", () => {
  it("sums humans and clamped bots", () => {
    expect(totalCarCount(4, 12)).toBe(16);
    expect(totalCarCount(2, 99)).toBe(14);
  });
});
