import { gameConfig } from "../config/gameConfig";
import type { ArenaView } from "../types/game";

export interface CameraState {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly rotation: number;
}

export interface CameraTarget {
  readonly x: number;
  readonly y: number;
  readonly speedFraction: number;
  readonly heading?: number;
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
    rotation: 0,
  };
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
  const targetZoom = zoomForSpeed(target.speedFraction);
  // Lower zoom value = wider view. Widening (speeding up) uses the faster rate.
  const zoomRate =
    targetZoom < state.zoom
      ? gameConfig.cameraZoomOutLerp
      : gameConfig.cameraFollowLerp;
  const zoomBlend = 1 - Math.exp(-zoomRate * dt);
  const zoom = state.zoom + (targetZoom - state.zoom) * zoomBlend;
  const targetRotation =
    target.heading === undefined
      ? state.rotation
      : normalizeAngle(-Math.PI / 2 - target.heading);
  const rotationDelta = normalizeAngle(targetRotation - state.rotation);
  const rotation = normalizeAngle(state.rotation + rotationDelta * blend);
  // Visible area in world units: viewport pixels divided by the zoom factor.
  const halfWidth = viewport.width / (2 * zoom);
  const halfHeight = viewport.height / (2 * zoom);
  const cosRotation = Math.abs(Math.cos(rotation));
  const sinRotation = Math.abs(Math.sin(rotation));
  const clampedHalfWidth = cosRotation * halfWidth + sinRotation * halfHeight;
  const clampedHalfHeight = sinRotation * halfWidth + cosRotation * halfHeight;
  return {
    x: clampCenter(
      state.x + (target.x - state.x) * blend,
      clampedHalfWidth,
      arena.width,
    ),
    y: clampCenter(
      state.y + (target.y - state.y) * blend,
      clampedHalfHeight,
      arena.height,
    ),
    zoom,
    rotation,
  };
}

export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let normalized = angle % twoPi;
  if (normalized > Math.PI) normalized -= twoPi;
  if (normalized < -Math.PI) normalized += twoPi;
  return normalized;
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
