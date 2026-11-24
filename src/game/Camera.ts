import { gameConfig } from "../config/gameConfig";
import type { ArenaView } from "../types/game";

export interface CameraState {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly zoomTarget: number;
  readonly zoomDwellS: number;
  readonly zoomDwellSign: ZoomDwellSign;
  readonly speedSmooth: number;
}

export type ZoomDwellSign = -1 | 0 | 1;

export interface CameraTarget {
  readonly x: number;
  readonly y: number;
  readonly speedFraction: number;
  readonly fitZoom?: number;
  readonly zoomScale?: number;
}

export interface CameraViewport {
  readonly width: number;
  readonly height: number;
}

export interface CameraBounds {
  readonly width: number;
  readonly height: number;
}

// Zoom factors are tuned for the Cash Run arena. A smaller arena needs a
// proportionally larger zoom so the visible share of the field stays the same.
export function zoomScaleForArena(arena: CameraBounds): number {
  return gameConfig.arenaWidth / arena.width;
}

export function createCamera(
  arena: CameraBounds | ArenaView,
  zoomScale = 1,
): CameraState {
  const zoom = gameConfig.cameraZoomRest * zoomScale;
  return {
    x: arena.width / 2,
    y: arena.height / 2,
    zoom,
    zoomTarget: zoom,
    zoomDwellS: 0,
    zoomDwellSign: 0,
    speedSmooth: 0,
  };
}

export function fitZoomForArena(
  viewport: CameraViewport,
  arena: CameraBounds,
): number {
  const fit = Math.min(
    viewport.width / arena.width,
    viewport.height / arena.height,
  );
  return fit * gameConfig.crashfestFitMargin;
}

export function zoomForSpeed(speedFraction: number, zoomScale = 1): number {
  const t = clamp01(speedFraction);
  return (
    gameConfig.cameraZoomRest *
    zoomScale *
    Math.pow(gameConfig.cameraZoomMoving / gameConfig.cameraZoomRest, t)
  );
}

export function stepCamera(
  state: CameraState,
  target: CameraTarget,
  dtSeconds: number,
  viewport: CameraViewport,
  arena: CameraBounds,
): CameraState {
  const dt = Math.max(0, dtSeconds);
  const blend = 1 - Math.exp(-gameConfig.cameraFollowLerp * dt);
  const speedBlend = 1 - Math.exp(-gameConfig.cameraSpeedSmoothRate * dt);
  const speedSmooth =
    state.speedSmooth +
    (clamp01(target.speedFraction) - state.speedSmooth) * speedBlend;
  const zoomHold = resolveZoomTarget(
    state,
    { ...target, speedFraction: speedSmooth },
    dt,
  );
  const targetZoom = zoomHold.zoomTarget;
  // Lower zoom value = wider view. Widening (speeding up) uses the faster rate.
  const zoomRate =
    targetZoom < state.zoom
      ? gameConfig.cameraZoomOutLerp
      : gameConfig.cameraFollowLerp;
  const zoomBlend = 1 - Math.exp(-zoomRate * dt);
  const zoom = state.zoom + (targetZoom - state.zoom) * zoomBlend;
  // Visible area in world units: viewport pixels divided by the zoom factor.
  const halfWidth = viewport.width / (2 * zoom);
  const halfHeight = viewport.height / (2 * zoom);
  return {
    x: clampCenter(
      state.x + (target.x - state.x) * blend,
      halfWidth,
      arena.width,
    ),
    y: clampCenter(
      state.y + (target.y - state.y) * blend,
      halfHeight,
      arena.height,
    ),
    zoom,
    zoomTarget: zoomHold.zoomTarget,
    zoomDwellS: zoomHold.zoomDwellS,
    zoomDwellSign: zoomHold.zoomDwellSign,
    speedSmooth,
  };
}

interface ZoomHoldState {
  readonly zoomTarget: number;
  readonly zoomDwellS: number;
  readonly zoomDwellSign: ZoomDwellSign;
}

// Dead time before the speed-based zoom target changes. Speed must stay on the
// far side of the committed target for the hold time (per direction) first.
// Fit zoom (spectating) bypasses the hold.
function resolveZoomTarget(
  state: CameraState,
  target: CameraTarget,
  dt: number,
): ZoomHoldState {
  if (target.fitZoom !== undefined) {
    return { zoomTarget: target.fitZoom, zoomDwellS: 0, zoomDwellSign: 0 };
  }
  const rawZoom = zoomForSpeed(target.speedFraction, target.zoomScale ?? 1);
  const sign = Math.sign(rawZoom - state.zoomTarget) as ZoomDwellSign;
  if (sign === 0) {
    return { zoomTarget: state.zoomTarget, zoomDwellS: 0, zoomDwellSign: 0 };
  }
  const dwellS = sign === state.zoomDwellSign ? state.zoomDwellS + dt : dt;
  const holdS =
    sign < 0 ? gameConfig.cameraZoomOutHoldS : gameConfig.cameraZoomInHoldS;
  if (dwellS < holdS) {
    return {
      zoomTarget: state.zoomTarget,
      zoomDwellS: dwellS,
      zoomDwellSign: sign,
    };
  }
  return { zoomTarget: rawZoom, zoomDwellS: dwellS, zoomDwellSign: sign };
}

function clampCenter(value: number, halfExtent: number, size: number): number {
  if (halfExtent * 2 >= size) return size / 2;
  return clamp(value, halfExtent, size - halfExtent);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
