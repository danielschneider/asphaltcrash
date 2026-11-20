import { describe, expect, it } from "vitest";
import { gameConfig } from "../src/config/gameConfig";

describe("smoke", () => {
  it("loads the game config", () => {
    expect(gameConfig.fixedStepHz).toBe(60);
  });
});
