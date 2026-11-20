import { describe, expect, it } from "vitest";
import { createRng } from "../../../src/game/sim/Rng";

function sequence(seed: number, count: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    expect(sequence(42, 50)).toEqual(sequence(42, 50));
  });

  it("produces different sequences for different seeds", () => {
    expect(sequence(1, 20)).not.toEqual(sequence(2, 20));
  });

  it("returns values in [0, 1)", () => {
    for (const value of sequence(7, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("nextInt stays within inclusive bounds and hits both ends", () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const value = rng.nextInt(10, 20);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThanOrEqual(20);
      seen.add(value);
    }
    expect(seen.has(10)).toBe(true);
    expect(seen.has(20)).toBe(true);
  });
});
