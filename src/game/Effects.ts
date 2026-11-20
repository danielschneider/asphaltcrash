import {
  Container,
  Filter,
  Graphics,
  GlProgram,
  UniformGroup,
  type UniformData,
} from "pixi.js";
import { gameConfig } from "../config/gameConfig";
import {
  CAR_DAMAGE_FRAGMENT,
  CAR_DAMAGE_VERTEX,
} from "./shaders/carDamageShader";
import {
  generateCarDamageMarks,
  markAlpha,
  type CarDamageMark,
} from "./shaders/carDamageMarks";

const SCRATCH_COLOR = 0x14110e;
const GRIME_COLOR = 0x2a2418;

export const EFFECT_BUDGET = {
  particles: 200,
  sparks: 20,
  smokePerCar: 8,
  destructionBurst: 30,
} as const;

export const EFFECT_KINDS = ["particle", "spark", "smoke", "burst"] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

export interface EffectBudget {
  acquire(kind: EffectKind): boolean;
  release(kind: EffectKind): void;
  count(kind: EffectKind): number;
}

export function createEffectLimits(): Record<EffectKind, number> {
  return {
    particle: EFFECT_BUDGET.particles,
    spark: EFFECT_BUDGET.sparks,
    smoke: EFFECT_BUDGET.smokePerCar * gameConfig.maxCars,
    burst: EFFECT_BUDGET.destructionBurst,
  };
}

const CAR_DAMAGE_UNIFORM_STRUCTURES = {
  uDamage: { value: 0, type: "f32" },
  uStrength: { value: gameConfig.carDamageMaxStrength, type: "f32" },
} satisfies Record<string, UniformData>;

const CAR_DAMAGE_SLOT_SEED_STRIDE = 7919;

interface CarDamageMarkView {
  readonly graphics: Graphics;
  readonly threshold: number;
}

export interface CarDamageMarkLayer {
  readonly container: Container;
  readonly views: readonly CarDamageMarkView[];
}

export interface CarDamageFilter {
  readonly filter: Filter;
  readonly uniforms: UniformGroup<
    typeof CAR_DAMAGE_UNIFORM_STRUCTURES
  >["uniforms"];
}

// WebGL only: no gpuProgram is supplied, so the WebGPU renderer skips this filter.
export function createCarDamageFilter(): CarDamageFilter {
  const group = new UniformGroup(CAR_DAMAGE_UNIFORM_STRUCTURES);
  const filter = new Filter({
    glProgram: GlProgram.from({
      vertex: CAR_DAMAGE_VERTEX,
      fragment: CAR_DAMAGE_FRAGMENT,
      name: "car-damage",
    }),
    resources: { carDamageUniforms: group },
  });
  return { filter, uniforms: group.uniforms };
}

// Marks are drawn once in car-local coordinates; only alpha changes per frame.
export function createCarDamageMarkLayer(
  slotIndex: number,
): CarDamageMarkLayer {
  const seed =
    gameConfig.visualSeed + (slotIndex + 1) * CAR_DAMAGE_SLOT_SEED_STRIDE;
  const marks = generateCarDamageMarks(
    seed,
    gameConfig.carDamageScratchCount,
    gameConfig.carWidth / 2,
    gameConfig.carHeight / 2,
  );
  const container = new Container();
  const views = marks.map((mark) => {
    const graphics = drawCarDamageMark(mark);
    graphics.alpha = 0;
    container.addChild(graphics);
    return { graphics, threshold: mark.threshold };
  });
  return { container, views };
}

export function setCarDamageMarkAlpha(
  views: readonly CarDamageMarkView[],
  damage: number,
): void {
  for (const view of views) {
    view.graphics.alpha = markAlpha(
      damage,
      view.threshold,
      gameConfig.carDamageMarkRamp,
    );
  }
}

function drawCarDamageMark(mark: CarDamageMark): Graphics {
  const g = new Graphics();
  const color = mark.kind === "grime" ? GRIME_COLOR : SCRATCH_COLOR;
  const first = mark.points[0];
  if (!first) return g;
  if (mark.points.length === 1) {
    g.circle(first.x, first.y, mark.width).fill(color);
    return g;
  }
  g.moveTo(first.x, first.y);
  for (const point of mark.points.slice(1)) g.lineTo(point.x, point.y);
  g.stroke({ width: mark.width, color, alpha: 0.85, join: "round" });
  return g;
}

export function createEffectBudget(
  limits: Record<EffectKind, number> = createEffectLimits(),
): EffectBudget {
  const counts: Record<EffectKind, number> = {
    particle: 0,
    spark: 0,
    smoke: 0,
    burst: 0,
  };
  return {
    acquire(kind: EffectKind): boolean {
      if (counts[kind] >= limits[kind]) return false;
      counts[kind] += 1;
      return true;
    },
    release(kind: EffectKind): void {
      if (counts[kind] > 0) counts[kind] -= 1;
    },
    count(kind: EffectKind): number {
      return counts[kind];
    },
  };
}
