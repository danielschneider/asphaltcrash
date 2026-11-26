import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import {
  clamp,
  headingOf,
  pairKey,
  reflectOffWalls,
  removeIntoWalls,
} from "../../../src/game/physics/vec";

describe("clamp", () => {
  it("limits values to the given range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-2, 0, 3)).toBe(0);
    expect(clamp(1.5, 0, 3)).toBe(1.5);
  });
});

describe("headingOf", () => {
  it("returns a unit vector for the angle", () => {
    const h = headingOf(Math.PI / 2);
    expect(h.x).toBeCloseTo(0, 10);
    expect(h.y).toBeCloseTo(1, 10);
  });
});

describe("pairKey", () => {
  it("is order independent", () => {
    expect(pairKey(7, 3)).toBe("3:7");
    expect(pairKey(3, 7)).toBe("3:7");
  });
});

describe("reflectOffWalls", () => {
  it("keeps velocity that points away from the wall", () => {
    const v = { x: 0, y: 10 };
    expect(
      reflectOffWalls(v, [{ x: 0, y: 1 }], gameConfig.wallRestitution),
    ).toEqual(v);
  });

  it("reflects the normal component and keeps the tangential one", () => {
    const restitution = 0.5;
    const out = reflectOffWalls(
      { x: 4, y: -10 },
      [{ x: 0, y: 1 }],
      restitution,
    );
    expect(out.x).toBeCloseTo(4, 10);
    expect(out.y).toBeCloseTo(-10 + (1 + restitution) * 10, 10);
  });

  it("applies each wall normal in turn", () => {
    const out = reflectOffWalls(
      { x: -10, y: -10 },
      [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
      0,
    );
    expect(out.x).toBeCloseTo(0, 10);
    expect(out.y).toBeCloseTo(0, 10);
  });
});

describe("removeIntoWalls", () => {
  it("drops the force component pushing into the wall", () => {
    const out = removeIntoWalls({ x: 3, y: -5 }, [{ x: 0, y: 1 }]);
    expect(out).toEqual({ x: 3, y: 0 });
  });

  it("keeps force that moves away from the wall", () => {
    const force = { x: 3, y: 5 };
    expect(removeIntoWalls(force, [{ x: 0, y: 1 }])).toEqual(force);
  });
});
