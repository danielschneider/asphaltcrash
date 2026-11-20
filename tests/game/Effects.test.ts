import { describe, expect, it } from "vitest";
import {
  EFFECT_BUDGET,
  createEffectBudget,
  createEffectLimits,
} from "../../src/game/Effects";
import { gameConfig } from "../../src/config/gameConfig";

describe("createEffectLimits", () => {
  it("derives caps from EFFECT_BUDGET and maxCars", () => {
    const limits = createEffectLimits();
    expect(limits.particle).toBe(EFFECT_BUDGET.particles);
    expect(limits.spark).toBe(EFFECT_BUDGET.sparks);
    expect(limits.smoke).toBe(EFFECT_BUDGET.smokePerCar * gameConfig.maxCars);
    expect(limits.burst).toBe(EFFECT_BUDGET.destructionBurst);
  });
});

describe("createEffectBudget", () => {
  it("refuses acquisition at the cap", () => {
    const budget = createEffectBudget({
      particle: 2,
      spark: 1,
      smoke: 1,
      burst: 1,
    });
    expect(budget.acquire("particle")).toBe(true);
    expect(budget.acquire("particle")).toBe(true);
    expect(budget.acquire("particle")).toBe(false);
    expect(budget.count("particle")).toBe(2);
  });

  it("frees a slot on release and never goes below zero", () => {
    const budget = createEffectBudget({
      particle: 1,
      spark: 1,
      smoke: 1,
      burst: 1,
    });
    budget.release("burst");
    expect(budget.count("burst")).toBe(0);
    expect(budget.acquire("burst")).toBe(true);
    expect(budget.acquire("burst")).toBe(false);
    budget.release("burst");
    expect(budget.acquire("burst")).toBe(true);
  });

  it("keeps kinds independent", () => {
    const budget = createEffectBudget({
      particle: 1,
      spark: 1,
      smoke: 1,
      burst: 1,
    });
    expect(budget.acquire("spark")).toBe(true);
    expect(budget.acquire("smoke")).toBe(true);
    expect(budget.count("particle")).toBe(0);
  });
});
