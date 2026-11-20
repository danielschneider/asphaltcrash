import {
  Application,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Texture,
} from "pixi.js";
import { gameConfig } from "../config/gameConfig";
import {
  CAR_FLAG,
  type ArenaView,
  type BillValue,
  type BillView,
  type CarView,
  type WorldView,
} from "../types/game";
import { createCamera, stepCamera, type CameraState } from "./Camera";
import {
  createCarDamageFilter,
  createCarDamageMarkLayer,
  createEffectBudget,
  EFFECT_BUDGET,
  setCarDamageMarkAlpha,
  type CarDamageFilter,
  type CarDamageMarkLayer,
  type EffectBudget,
  type EffectKind,
} from "./Effects";
import { generateGroundLayout } from "./ground/groundLayout";
import { createRng, type Rng } from "./sim/Rng";
import { damageFromHealth, smoothDamage } from "./shaders/carDamage";

export interface WorldRenderer {
  update(view: WorldView, dtSeconds: number): void;
  resize(): void;
  destroy(): void;
}

const BACKGROUND_COLOR = 0x2b2d31;
const FLOOR_COLOR = 0x3a3d42;
const PATCH_LIGHT_COLOR = 0x44474e;
const PATCH_DARK_COLOR = 0x32353a;
const PATCH_ALPHA = 0.6;
const SPECKLE_LIGHT_COLOR = 0x5a5e66;
const SPECKLE_DARK_COLOR = 0x2a2d32;
const SPECKLE_ALPHA = 0.7;
const SPECKLE_SIZE = 3;
const WALL_COLOR = 0x1a1c20;
const CURB_COLOR = 0x2c2f35;
const CURB_EDGE_COLOR = 0x8a8f99;
const CURB_EDGE_WIDTH = 2;

const WINDSHIELD_COLOR = 0x9fd8ff;
const CARGO_COLOR = 0xffd166;
const HEALTH_BG_COLOR = 0x000000;
const HEALTH_FG_COLOR = 0x7ed957;
const BILL_COLORS = {
  10: 0x7ccf6b,
  20: 0x4aa3df,
  50: 0xffc857,
} as const satisfies Record<BillValue, number>;
const BILL_STRIPE_COLOR = 0x1d3b1f;
const DESTROYED_ALPHA = 0.3;
const HEALTH_BAR_WIDTH = 40;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_GAP = 8;
const LOW_HEALTH_RATIO = 0.5;
const SMOKE_SPAWN_CHANCE = 0.25;
const SMOKE_LIFE_SECONDS = 0.8;
const BURST_PARTICLES = 12;
const BURST_LIFE_SECONDS = 0.6;
const BURST_SPEED = 160;
const PARTICLE_SIZE = 6;
const SMOKE_SIZE = 10;
const SMOKE_COLOR = 0xb0b0b0;
const MAX_FRAME_SECONDS = 0.1;
const TWO_PI = Math.PI * 2;

interface CarSlot {
  readonly root: Container;
  readonly body: Graphics;
  readonly marks: CarDamageMarkLayer;
  readonly cargoDot: Graphics;
  readonly bar: Container;
  readonly barFill: Graphics;
  readonly damageFilter: CarDamageFilter | null;
  pid: number;
  damage: number;
}

interface BillSlot {
  readonly root: Container;
  value: BillValue | null;
}

interface EffectSlot {
  readonly particle: Particle;
  kind: EffectKind | null;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
}

interface RenderState {
  camera: CameraState;
  prevLocal: { x: number; y: number } | null;
  wasDestroyed: Uint8Array;
}

interface VisualContext {
  readonly budget: EffectBudget;
  readonly effects: readonly EffectSlot[];
  readonly rng: Rng;
}

export async function createWorldRenderer(
  host: HTMLElement,
  arena: ArenaView,
): Promise<WorldRenderer> {
  const app = new Application();
  await app.init({
    resizeTo: host,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    antialias: true,
    background: BACKGROUND_COLOR,
    preference: "webgl",
  });
  host.appendChild(app.canvas);

  const world = new Container();
  const arenaLayer = new Container();
  const billLayer = new Container();
  const carLayer = new Container();
  const effectsLayer = new Container();
  world.addChild(arenaLayer, billLayer, carLayer, effectsLayer);
  app.stage.addChild(world);

  drawArena(arenaLayer, arena);
  const bills = createBillPool(billLayer);
  const cars = createCarPool(carLayer);
  const effectsParticles = new ParticleContainer({
    dynamicProperties: { position: true, vertex: true, color: true },
  });
  effectsLayer.addChild(effectsParticles);
  const effects = createEffectPool(effectsParticles);
  const budget = createEffectBudget();
  const visuals: VisualContext = {
    budget,
    effects,
    rng: createRng(gameConfig.visualSeed),
  };

  const state: RenderState = {
    camera: createCamera(arena),
    prevLocal: null,
    wasDestroyed: new Uint8Array(gameConfig.maxCars),
  };

  return {
    update(view: WorldView, dtSeconds: number): void {
      const dt = clampFrameSeconds(dtSeconds);
      updateBills(bills, view.bills);
      updateCars(cars, view.cars, state, visuals, dt);
      stepEffects(effects, budget, dt);
      updateCamera(world, app, state, view, arena, dt);
    },
    resize(): void {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width <= 0 || height <= 0) return;
      if (app.screen.width === width && app.screen.height === height) return;
      app.renderer.resize(width, height);
    },
    destroy(): void {
      app.destroy(true, { children: true });
    },
  };
}

function drawArena(layer: Container, arena: ArenaView): void {
  const layout = generateGroundLayout(arena, gameConfig.visualSeed, gameConfig);
  const floor = new Graphics();
  floor.rect(0, 0, arena.width, arena.height).fill(FLOOR_COLOR);
  for (const patch of layout.patches) {
    floor.rect(patch.x, patch.y, patch.width, patch.height).fill({
      color: patch.tone === "light" ? PATCH_LIGHT_COLOR : PATCH_DARK_COLOR,
      alpha: PATCH_ALPHA,
    });
  }
  const speckles = new Graphics();
  for (const point of layout.speckles) {
    speckles.rect(point.x, point.y, SPECKLE_SIZE, SPECKLE_SIZE).fill({
      color: point.tone === "light" ? SPECKLE_LIGHT_COLOR : SPECKLE_DARK_COLOR,
      alpha: SPECKLE_ALPHA,
    });
  }
  const walls = new Graphics();
  const t = arena.wallThickness;
  walls.rect(0, 0, arena.width, t).fill(WALL_COLOR);
  walls.rect(0, arena.height - t, arena.width, t).fill(WALL_COLOR);
  walls.rect(0, 0, t, arena.height).fill(WALL_COLOR);
  walls.rect(arena.width - t, 0, t, arena.height).fill(WALL_COLOR);
  for (const curb of layout.curbs) {
    walls
      .rect(curb.x, curb.y, curb.width, curb.height)
      .fill(CURB_COLOR)
      .stroke({ width: CURB_EDGE_WIDTH, color: CURB_EDGE_COLOR, alpha: 0.6 });
  }
  const bases = new Graphics();
  for (const base of arena.bases) {
    const color = playerColor(base.pid);
    bases
      .rect(
        base.x - base.width / 2,
        base.y - base.height / 2,
        base.width,
        base.height,
      )
      .fill({ color, alpha: 0.15 })
      .stroke({ width: 4, color, alpha: 0.8 });
  }
  layer.addChild(floor, speckles, walls, bases);
}

function createBillPool(layer: Container): BillSlot[] {
  const slots: BillSlot[] = [];
  for (let i = 0; i < gameConfig.maxBillsOnField; i += 1) {
    const root = new Container();
    root.visible = false;
    layer.addChild(root);
    slots.push({ root, value: null });
  }
  return slots;
}

function createCarPool(layer: Container): CarSlot[] {
  const slots: CarSlot[] = [];
  for (let i = 0; i < gameConfig.maxCars; i += 1) {
    const root = new Container();
    const body = new Graphics();
    const marks = createCarDamageMarkLayer(i);
    const cargoDot = new Graphics();
    cargoDot.circle(0, 0, 4).fill(CARGO_COLOR);
    cargoDot.visible = false;
    const damageFilter = gameConfig.carDamageShaderEnabled
      ? createCarDamageFilter()
      : null;
    if (damageFilter) body.filters = [damageFilter.filter];
    root.addChild(body, marks.container, cargoDot);
    const bar = new Container();
    const barBg = new Graphics();
    barBg
      .rect(0, -HEALTH_BAR_HEIGHT / 2, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT)
      .fill({ color: HEALTH_BG_COLOR, alpha: 0.5 });
    const barFill = new Graphics();
    barFill
      .rect(0, -HEALTH_BAR_HEIGHT / 2, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT)
      .fill(HEALTH_FG_COLOR);
    bar.addChild(barBg, barFill);
    root.visible = false;
    bar.visible = false;
    layer.addChild(root, bar);
    slots.push({
      root,
      body,
      marks,
      cargoDot,
      bar,
      barFill,
      damageFilter,
      pid: -1,
      damage: 0,
    });
  }
  return slots;
}

function createEffectPool(layer: ParticleContainer): EffectSlot[] {
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

function updateBills(
  slots: readonly BillSlot[],
  bills: readonly BillView[],
): void {
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (!slot) continue;
    const bill = bills[i];
    if (!bill) {
      slot.root.visible = false;
      continue;
    }
    if (slot.value !== bill.value) drawBill(slot, bill.value);
    slot.root.visible = true;
    slot.root.position.set(bill.x, bill.y);
  }
}

function drawBill(slot: BillSlot, value: BillValue): void {
  slot.root.removeChildren().forEach((child) => child.destroy());
  const r = gameConfig.billRadius;
  const g = new Graphics();
  g.roundRect(-r, -r, r * 2, r * 2, 4).fill(BILL_COLORS[value]);
  g.rect(-r, -2, r * 2, 4).fill(BILL_STRIPE_COLOR);
  slot.root.addChild(g);
  slot.value = value;
}

function updateCars(
  slots: readonly CarSlot[],
  cars: readonly CarView[],
  state: RenderState,
  visuals: VisualContext,
  dt: number,
): void {
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    const car = cars[i];
    if (!slot) continue;
    if (!car) {
      slot.root.visible = false;
      slot.bar.visible = false;
      continue;
    }
    if (slot.pid !== car.pid) drawCarBody(slot, car.pid);
    updateCarSlot(slot, car, dt);
    handleCarEffects(car, state, visuals);
  }
}

function drawCarBody(slot: CarSlot, pid: number): void {
  const w = gameConfig.carWidth;
  const h = gameConfig.carHeight;
  slot.body.clear();
  slot.body.roundRect(-w / 2, -h / 2, w, h, 4).fill(playerColor(pid));
  slot.body.rect(w / 2 - 16, -h / 2 + 4, 10, h - 8).fill(WINDSHIELD_COLOR);
  slot.cargoDot.position.set(-w / 4, 0);
  slot.pid = pid;
}

function updateCarSlot(slot: CarSlot, car: CarView, dt: number): void {
  const isDestroyed = (car.flags & CAR_FLAG.destroyed) !== 0;
  const hpRatio = clamp01(car.hp / gameConfig.maxHealth);
  slot.root.visible = true;
  slot.root.position.set(car.x, car.y);
  slot.root.rotation = car.angle;
  slot.root.alpha = isDestroyed ? DESTROYED_ALPHA : 1;
  slot.cargoDot.visible = car.cargo > 0;
  slot.bar.visible = !isDestroyed;
  slot.marks.container.visible = !isDestroyed;
  slot.bar.position.set(
    car.x - HEALTH_BAR_WIDTH / 2,
    car.y - gameConfig.carHeight / 2 - HEALTH_BAR_GAP,
  );
  slot.barFill.scale.x = hpRatio;
  updateCarDamage(slot, car, dt);
}

function updateCarDamage(slot: CarSlot, car: CarView, dt: number): void {
  const target = damageFromHealth(car.hp, gameConfig.maxHealth);
  slot.damage = smoothDamage(
    slot.damage,
    target,
    dt,
    gameConfig.carDamageSmoothingRate,
  );
  if (slot.damageFilter) slot.damageFilter.uniforms.uDamage = slot.damage;
  setCarDamageMarkAlpha(slot.marks.views, slot.damage);
}

function handleCarEffects(
  car: CarView,
  state: RenderState,
  visuals: VisualContext,
): void {
  const isDestroyed = (car.flags & CAR_FLAG.destroyed) !== 0;
  const pidIndex = car.pid;
  if (pidIndex < 0 || pidIndex >= state.wasDestroyed.length) return;
  if (isDestroyed) {
    if (state.wasDestroyed[pidIndex] === 0) {
      state.wasDestroyed[pidIndex] = 1;
      spawnBurst(car, visuals);
    }
    return;
  }
  state.wasDestroyed[pidIndex] = 0;
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

function spawnBurst(car: CarView, visuals: VisualContext): void {
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

function spawnParticle(
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

function stepEffects(
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

function updateCamera(
  world: Container,
  app: Application,
  state: RenderState,
  view: WorldView,
  arena: ArenaView,
  dt: number,
): void {
  const local = view.cars.find((car) => car.isLocal);
  const target = local
    ? { x: local.x, y: local.y, speedFraction: speedFraction(state, local, dt) }
    : { x: arena.width / 2, y: arena.height / 2, speedFraction: 0 };
  if (local) state.prevLocal = { x: local.x, y: local.y };
  state.camera = stepCamera(
    state.camera,
    target,
    dt,
    { width: app.screen.width, height: app.screen.height },
    arena,
  );
  const zoom = state.camera.zoom;
  world.scale.set(zoom);
  world.position.set(
    app.screen.width / 2 - state.camera.x * zoom,
    app.screen.height / 2 - state.camera.y * zoom,
  );
}

function speedFraction(state: RenderState, car: CarView, dt: number): number {
  const prev = state.prevLocal;
  if (!prev || dt <= 0) return 0;
  const speed = Math.hypot(car.x - prev.x, car.y - prev.y) / dt;
  return clamp01(
    speed / (gameConfig.maxForwardSpeed + gameConfig.boostSpeedBonus),
  );
}

function clampFrameSeconds(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0) return 0;
  return Math.min(dtSeconds, MAX_FRAME_SECONDS);
}

function playerColor(pid: number): number {
  const colors = gameConfig.playerColors;
  const index = ((pid % colors.length) + colors.length) % colors.length;
  return colors[index] ?? 0xffffff;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
