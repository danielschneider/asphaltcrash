// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  generateGroundLayout,
  type GroundArena,
  type GroundLayoutConfig,
} from "../../../src/game/ground/groundLayout";

const ARENA: GroundArena = { width: 3200, height: 2400, wallThickness: 40 };
const CONFIG: GroundLayoutConfig = {
  groundSpeckleCount: 900,
  groundPatchCount: 14,
  groundCurbWidth: 16,
};

describe("generateGroundLayout", () => {
  it("is deterministic for the same seed", () => {
    expect(generateGroundLayout(ARENA, 1337, CONFIG)).toEqual(
      generateGroundLayout(ARENA, 1337, CONFIG),
    );
  });

  it("differs for different seeds", () => {
    const a = generateGroundLayout(ARENA, 1, CONFIG);
    const b = generateGroundLayout(ARENA, 2, CONFIG);
    expect(a.speckles).not.toEqual(b.speckles);
    expect(a.patches).not.toEqual(b.patches);
  });

  it("keeps all speckles and patches inside the inner arena", () => {
    const layout = generateGroundLayout(ARENA, 42, CONFIG);
    const left = ARENA.wallThickness;
    const top = ARENA.wallThickness;
    const right = ARENA.width - ARENA.wallThickness;
    const bottom = ARENA.height - ARENA.wallThickness;
    for (const point of layout.speckles) {
      expect(point.x).toBeGreaterThanOrEqual(left);
      expect(point.x).toBeLessThanOrEqual(right);
      expect(point.y).toBeGreaterThanOrEqual(top);
      expect(point.y).toBeLessThanOrEqual(bottom);
    }
    for (const patch of layout.patches) {
      expect(patch.x).toBeGreaterThanOrEqual(left);
      expect(patch.y).toBeGreaterThanOrEqual(top);
      expect(patch.x + patch.width).toBeLessThanOrEqual(right);
      expect(patch.y + patch.height).toBeLessThanOrEqual(bottom);
    }
  });

  it("matches configured counts", () => {
    const layout = generateGroundLayout(ARENA, 7, CONFIG);
    expect(layout.speckles).toHaveLength(CONFIG.groundSpeckleCount);
    expect(layout.patches).toHaveLength(CONFIG.groundPatchCount);
    expect(layout.curbs).toHaveLength(4);
  });

  it("places curbs along the inner wall edges with configured width", () => {
    const layout = generateGroundLayout(ARENA, 7, CONFIG);
    for (const curb of layout.curbs) {
      expect(Math.min(curb.width, curb.height)).toBe(CONFIG.groundCurbWidth);
    }
  });
});
