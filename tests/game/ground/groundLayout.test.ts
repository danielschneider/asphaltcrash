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
  groundLaneDashLength: 120,
  groundLaneDashGap: 80,
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

  it("produces dashes that never exceed the arena length and stay in bounds", () => {
    const layout = generateGroundLayout(ARENA, 7, CONFIG);
    expect(layout.laneDashes.length).toBeGreaterThan(0);
    for (const dash of layout.laneDashes) {
      const length = Math.hypot(dash.x2 - dash.x1, dash.y2 - dash.y1);
      expect(length).toBeLessThanOrEqual(CONFIG.groundLaneDashLength + 1e-9);
      expect(dash.x1).toBeGreaterThanOrEqual(0);
      expect(dash.x2).toBeLessThanOrEqual(ARENA.width);
      expect(dash.y1).toBeGreaterThanOrEqual(0);
      expect(dash.y2).toBeLessThanOrEqual(ARENA.height);
    }
  });

  it("returns no dashes when the dash length is zero", () => {
    const layout = generateGroundLayout(ARENA, 7, {
      ...CONFIG,
      groundLaneDashLength: 0,
    });
    expect(layout.laneDashes).toHaveLength(0);
  });

  it("places curbs along the inner wall edges with configured width", () => {
    const layout = generateGroundLayout(ARENA, 7, CONFIG);
    for (const curb of layout.curbs) {
      expect(Math.min(curb.width, curb.height)).toBe(CONFIG.groundCurbWidth);
    }
  });
});
