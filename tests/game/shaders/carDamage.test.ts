// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CAR_DAMAGE_FRAGMENT,
  CAR_DAMAGE_UNIFORM_NAMES,
  CAR_DAMAGE_VERTEX,
} from "../../../src/game/shaders/carDamageShader";
import {
  generateCarDamageMarks,
  markAlpha,
} from "../../../src/game/shaders/carDamageMarks";
import {
  damageFromHealth,
  smoothDamage,
} from "../../../src/game/shaders/carDamage";
import { gameConfig } from "../../../src/config/gameConfig";

describe("damageFromHealth", () => {
  it("maps full health to 0 and zero health to 1", () => {
    expect(damageFromHealth(100, 100)).toBe(0);
    expect(damageFromHealth(0, 100)).toBe(1);
  });

  it("maps linearly in between", () => {
    expect(damageFromHealth(75, 100)).toBeCloseTo(0.25);
    expect(damageFromHealth(40, 80)).toBeCloseTo(0.5);
  });

  it("clamps out-of-range hp", () => {
    expect(damageFromHealth(120, 100)).toBe(0);
    expect(damageFromHealth(-20, 100)).toBe(1);
  });

  it("returns 0 for non-finite input", () => {
    expect(damageFromHealth(Number.NaN, 100)).toBe(0);
    expect(damageFromHealth(50, 0)).toBe(0);
  });
});

describe("smoothDamage", () => {
  it("moves toward the target without overshooting", () => {
    let value = 0;
    for (let i = 0; i < 600; i += 1) {
      const next = smoothDamage(value, 0.8, 1 / 60, 4);
      expect(next).toBeGreaterThanOrEqual(value);
      expect(next).toBeLessThanOrEqual(0.8);
      value = next;
    }
    expect(value).toBeCloseTo(0.8, 3);
  });

  it("moves monotonically back toward a lower target", () => {
    let value = 1;
    for (let i = 0; i < 120; i += 1) {
      const next = smoothDamage(value, 0, 1 / 60, 4);
      expect(next).toBeLessThanOrEqual(value);
      expect(next).toBeGreaterThanOrEqual(0);
      value = next;
    }
  });

  it("stays bounded for out-of-range inputs", () => {
    const next = smoothDamage(5, -3, 10, 1000);
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThanOrEqual(1);
  });

  it("holds the current value for zero dt or zero rate", () => {
    expect(smoothDamage(0.3, 1, 0, 4)).toBeCloseTo(0.3);
    expect(smoothDamage(0.3, 1, 0.1, 0)).toBeCloseTo(0.3);
  });
});

describe("car damage visual config", () => {
  it("keeps the whole-body tone pass disabled so damage shows as marks only", () => {
    expect(gameConfig.carDamageShaderEnabled).toBe(false);
  });
});

describe("car damage shader source", () => {
  it("declares every uniform name used by the TypeScript side", () => {
    for (const name of CAR_DAMAGE_UNIFORM_NAMES) {
      expect(CAR_DAMAGE_FRAGMENT).toMatch(new RegExp(`uniform \\w+ ${name};`));
    }
  });

  it("uses the PixiJS v8 texture and varying names", () => {
    expect(CAR_DAMAGE_FRAGMENT).toContain("uniform sampler2D uTexture");
    expect(CAR_DAMAGE_FRAGMENT).toContain("vTextureCoord");
    expect(CAR_DAMAGE_VERTEX).toContain("vTextureCoord");
    expect(CAR_DAMAGE_VERTEX).toContain("uOutputFrame");
  });

  it("has no spatial pattern work driven by texture coordinates", () => {
    const uses = CAR_DAMAGE_FRAGMENT.split("\n").filter((line) =>
      line.includes("vTextureCoord"),
    );
    expect(uses).toEqual([
      "in vec2 vTextureCoord;",
      "  vec4 src = texture(uTexture, vTextureCoord);",
    ]);
    expect(CAR_DAMAGE_FRAGMENT).not.toMatch(/hash|uSizePx|uSeed|for \(/);
  });
});

describe("markAlpha", () => {
  it("is bounded 0..1 and monotonic in damage", () => {
    for (const threshold of [0, 0.3, 0.7, 1]) {
      let previous = -1;
      for (let d = 0; d <= 1.0001; d += 0.01) {
        const alpha = markAlpha(d, threshold, 0.35);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
        expect(alpha).toBeGreaterThanOrEqual(previous);
        previous = alpha;
      }
    }
  });

  it("is zero below the threshold and one after threshold plus ramp", () => {
    expect(markAlpha(0.2, 0.5, 0.35)).toBe(0);
    expect(markAlpha(0.5 + 0.35, 0.5, 0.35)).toBeCloseTo(1);
    expect(markAlpha(1, 0.5, 0.35)).toBe(1);
  });

  it("clamps out-of-range damage and handles zero ramp", () => {
    expect(markAlpha(-2, 0, 0.35)).toBe(0);
    expect(markAlpha(5, 0.2, 0.35)).toBe(1);
    expect(markAlpha(0.4, 0.5, 0)).toBe(0);
    expect(markAlpha(0.6, 0.5, 0)).toBe(1);
  });
});

describe("generateCarDamageMarks", () => {
  const halfWidth = 24;
  const halfHeight = 12;

  it("is deterministic for a given seed", () => {
    const a = generateCarDamageMarks(1337, 12, halfWidth, halfHeight);
    const b = generateCarDamageMarks(1337, 12, halfWidth, halfHeight);
    expect(a).toEqual(b);
  });

  it("differs between seeds", () => {
    const a = generateCarDamageMarks(1337, 12, halfWidth, halfHeight);
    const b = generateCarDamageMarks(4242, 12, halfWidth, halfHeight);
    expect(a).not.toEqual(b);
  });

  it("returns the requested count with thresholds in 0..1", () => {
    const marks = generateCarDamageMarks(7, 9, halfWidth, halfHeight);
    expect(marks).toHaveLength(9);
    for (const mark of marks) {
      expect(mark.threshold).toBeGreaterThanOrEqual(0);
      expect(mark.threshold).toBeLessThanOrEqual(1);
    }
  });

  it("keeps every point and stroke inside the body rectangle", () => {
    const marks = generateCarDamageMarks(1337, 40, halfWidth, halfHeight);
    for (const mark of marks) {
      const extent = mark.kind === "grime" ? mark.width : mark.width / 2;
      for (const point of mark.points) {
        expect(Math.abs(point.x) + extent).toBeLessThanOrEqual(halfWidth);
        expect(Math.abs(point.y) + extent).toBeLessThanOrEqual(halfHeight);
      }
    }
  });
});
