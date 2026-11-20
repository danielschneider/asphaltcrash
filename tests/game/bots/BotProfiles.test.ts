import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import { profileFor } from "../../../src/game/bots/BotProfiles";

describe("profileFor", () => {
  it.each(["easy", "normal", "hard"] as const)(
    "returns the gameConfig profile for %s",
    (difficulty) => {
      expect(profileFor(difficulty)).toBe(gameConfig.botProfiles[difficulty]);
    },
  );

  it.each(["easy", "normal", "hard"] as const)(
    "keeps %s values finite and non-negative",
    (difficulty) => {
      const profile = profileFor(difficulty);
      for (const value of Object.values(profile)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(profile.reactionDelayTicks).toBeGreaterThan(0);
    },
  );

  it("orders reaction delay from easy to hard", () => {
    expect(profileFor("easy").reactionDelayTicks).toBeGreaterThan(
      profileFor("normal").reactionDelayTicks,
    );
    expect(profileFor("normal").reactionDelayTicks).toBeGreaterThan(
      profileFor("hard").reactionDelayTicks,
    );
  });
});
