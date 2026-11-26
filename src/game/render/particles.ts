import { Particle, ParticleContainer, Texture } from "pixi.js";
import { gameConfig } from "../../config/gameConfig";
import { CAR_FLAG, type CarView } from "../../types/game";
import { EFFECT_BUDGET, type EffectBudget, type EffectKind } from "../Effects";
import type { Rng } from "../sim/Rng";
import { PARTICLE_SIZE, playerColor, SMOKE_COLOR, SMOKE_SIZE } from "./palette";

export interface EffectSlot {
  readonly particle: Particle;
  kind: EffectKind | null;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
}

export interface VisualContext {
  readonly budget: EffectBudget;
  readonly effects: readonly EffectSlot[];
  readonly rng: Rng;
}

const LOW_HEALTH_RATIO = 0.5;
const SMOKE_SPAWN_CHANCE = 0.25;
const SMOKE_LIFE_SECONDS = 0.8;
const BURST_PARTICLES = 12;
const BURST_LIFE_SECONDS = 0.6;
const BURST_SPEED = 160;
const TWO_PI = Math.PI * 2;

export function createEffectPool(layer: ParticleContainer): EffectSlot[] {
  const slots: EffectSlot[] = [];
  for (let i = 0; i < EFFECT_BUDGET.particles; i += 1) {
    const particle = new Particle({
      texture: Texture.WHITE,
      anchorX: 0.5,
      anchorY: 0.5,
      alpha: 0,
    });
    slots.push({
      particle,
      kind: null,
      life: 0,
      maxLife: 1,
      vx: 0,
      vy: 0,
      size: PARTICLE_SIZE,
      color: 0xffffff,
    });
    layer.addParticle(particle);
  }
  return slots;
}

export function handleCarEffects(
  car: CarView,
  wasDestroyed: Uint8Array,
  visuals: VisualContext,
): void {
  const isDestroyed = (car.flags & CAR_FLAG.destroyed) !== 0;
  const pidIndex = car.pid;
  if (pidIndex < 0 || pidIndex >= wasDestroyed.length) return;
  if (isDestroyed) {
    if (wasDestroyed[pidIndex] === 0) {
      wasDestroyed[pidIndex] = 1;
      spawnBurst(car, visuals);
    }
    return;
  }
  wasDestroyed[pidIndex] = 0;
  if (
    car.hp / gameConfig.maxHealth < LOW_HEALTH_RATIO &&
    visuals.rng.next() < SMOKE_SPAWN_CHANCE
  ) {
    spawnParticle(
      visuals,
      "smoke",
      car.x,
      car.y,
      0,
      -30,
      SMOKE_COLOR,
      SMOKE_SIZE,
      SMOKE_LIFE_SECONDS,
    );
  }
}

export function spawnBurst(car: CarView, visuals: VisualContext): void {
  const color = playerColor(car.pid);
  for (let i = 0; i < BURST_PARTICLES; i += 1) {
    const angle = (i / BURST_PARTICLES) * TWO_PI;
    const speed = BURST_SPEED * (0.5 + visuals.rng.next() * 0.5);
    spawnParticle(
      visuals,
      "burst",
      car.x,
      car.y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      color,
      PARTICLE_SIZE,
      BURST_LIFE_SECONDS,
    );
  }
}

export function spawnParticle(
  visuals: VisualContext,
  kind: EffectKind,
  x: number,
  y: number,
  vx: number,
  vy: number,
  color: number,
  size: number,
  life: number,
): void {
  const { budget, effects } = visuals;
  const slot = effects.find((candidate) => candidate.kind === null);
  if (!slot) return;
  if (!budget.acquire("particle")) return;
  if (!budget.acquire(kind)) {
    budget.release("particle");
    return;
  }
  slot.kind = kind;
  slot.life = life;
  slot.maxLife = life;
  slot.vx = vx;
  slot.vy = vy;
  slot.size = size;
  slot.color = color;
  slot.particle.x = x;
  slot.particle.y = y;
  slot.particle.scaleX = size;
  slot.particle.scaleY = size;
  slot.particle.tint = color;
  slot.particle.alpha = 1;
}

export function stepEffects(
  effects: readonly EffectSlot[],
  budget: EffectBudget,
  dt: number,
): void {
  for (let i = 0; i < effects.length; i += 1) {
    const slot = effects[i];
    if (!slot || slot.kind === null) continue;
    slot.life -= dt;
    if (slot.life <= 0) {
      budget.release(slot.kind);
      budget.release("particle");
      slot.kind = null;
      slot.particle.alpha = 0;
      continue;
    }
    slot.particle.x += slot.vx * dt;
    slot.particle.y += slot.vy * dt;
    slot.particle.alpha = slot.life / slot.maxLife;
  }
}
