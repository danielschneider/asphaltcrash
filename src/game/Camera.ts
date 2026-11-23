import { gameConfig } from "../config/gameConfig";
import type { ArenaView } from "../types/game";

export interface CameraState {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface CameraTarget {
  readonly x: number;
  readonly y: number;
  readonly speedFraction: number;
  readonly fitZoom?: number;
}

export interface CameraViewport {
  readonly width: number;
  readonly height: number;
}

export interface CameraBounds {
  readonly width: number;
  readonly height: number;
}

export function createCamera(arena: CameraBounds | ArenaView): CameraState {
  return {
    x: arena.width / 2,
    y: arena.height / 2,
    zoom: gameConfig.cameraZoomRest,
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

export function zoomForSpeed(speedFraction: number): number {
  const t = clamp01(speedFraction);
  return (
    gameConfig.cameraZoomRest *
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
  const targetZoom = target.fitZoom ?? zoomForSpeed(target.speedFraction);
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
  };
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
