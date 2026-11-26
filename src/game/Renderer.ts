import { Application, Container, ParticleContainer } from "pixi.js";
import { gameConfig } from "../config/gameConfig";
import {
  CAR_FLAG,
  type ArenaView,
  type CarView,
  type WorldView,
} from "../types/game";
import {
  createCamera,
  fitZoomForArena,
  stepCamera,
  zoomScaleForArena,
  type CameraState,
} from "./Camera";
import { createEffectBudget, type EffectBudget } from "./Effects";
import { createRng } from "./sim/Rng";
import { drawArena } from "./render/arenaLayer";
import { createBillPool, updateBills } from "./render/billLayer";
import { createCarPool, updateCars } from "./render/carLayer";
import { BACKGROUND_COLOR } from "./render/palette";
import {
  createEffectPool,
  stepEffects,
  type EffectSlot,
  type VisualContext,
} from "./render/particles";

export interface WorldRenderer {
  update(view: WorldView, dtSeconds: number): void;
  resize(): void;
  destroy(): void;
}

const MAX_FRAME_SECONDS = 0.1;

interface RenderState {
  camera: CameraState;
  wasDestroyed: Uint8Array;
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
  const effects: readonly EffectSlot[] = createEffectPool(effectsParticles);
  const budget: EffectBudget = createEffectBudget();
  const visuals: VisualContext = {
    budget,
    effects,
    rng: createRng(gameConfig.visualSeed),
  };

  const state: RenderState = {
    camera: createCamera(arena, zoomScaleForArena(arena)),
    wasDestroyed: new Uint8Array(gameConfig.maxCars),
  };

  return {
    update(view: WorldView, dtSeconds: number): void {
      const dt = clampFrameSeconds(dtSeconds);
      updateBills(bills, view.bills);
      updateCars(cars, view.cars, state.wasDestroyed, visuals, dt);
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

function updateCamera(
  world: Container,
  app: Application,
  state: RenderState,
  view: WorldView,
  arena: ArenaView,
  dt: number,
): void {
  const local = view.cars.find((car) => car.isLocal);
  const isSpectating =
    arena.isElimination === true &&
    local !== undefined &&
    (local.flags & CAR_FLAG.destroyed) !== 0;
  const viewport = { width: app.screen.width, height: app.screen.height };
  const zoomScale = zoomScaleForArena(arena);
  const target = isSpectating
    ? {
        x: arena.width / 2,
        y: arena.height / 2,
        speedFraction: 0,
        fitZoom: fitZoomForArena(viewport, arena),
      }
    : localTarget(local, arena, zoomScale);
  state.camera = stepCamera(state.camera, target, dt, viewport, arena);
  const zoom = state.camera.zoom;
  world.scale.set(zoom);
  world.position.set(
    app.screen.width / 2 - state.camera.x * zoom,
    app.screen.height / 2 - state.camera.y * zoom,
  );
}

function localTarget(
  local: CarView | undefined,
  arena: ArenaView,
  zoomScale: number,
): { x: number; y: number; speedFraction: number; zoomScale: number } {
  if (!local) {
    return {
      x: arena.width / 2,
      y: arena.height / 2,
      speedFraction: 0,
      zoomScale,
    };
  }
  return {
    x: local.x,
    y: local.y,
    speedFraction: speedFraction(local),
    zoomScale,
  };
}

function speedFraction(car: CarView): number {
  const speed = Math.hypot(car.vx, car.vy);
  return clamp01(
    speed / (gameConfig.maxForwardSpeed + gameConfig.boostSpeedBonus),
  );
}

function clampFrameSeconds(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0) return 0;
  return Math.min(dtSeconds, MAX_FRAME_SECONDS);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
