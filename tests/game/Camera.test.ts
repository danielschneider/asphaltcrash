import { describe, expect, it } from "vitest";
import { gameConfig } from "../../src/config/gameConfig";
import {
  createCamera,
  stepCamera,
  zoomForSpeed,
  type CameraState,
  type CameraTarget,
} from "../../src/game/Camera";

const ARENA = { width: 2400, height: 1600 };
const VIEWPORT = { width: 1000, height: 700 };
const STATE: CameraState = { x: 1200, y: 800, zoom: 1 };
const SETTLE_STEPS = 600;

function settle(target: CameraTarget, start: CameraState): CameraState {
  let state = start;
  for (let i = 0; i < SETTLE_STEPS; i += 1) {
    state = stepCamera(state, target, 1 / 60, VIEWPORT, ARENA);
  }
  return state;
}

describe("createCamera", () => {
  it("starts centred on the arena at rest zoom", () => {
    expect(createCamera(ARENA)).toEqual({
      x: 1200,
      y: 800,
      zoom: gameConfig.cameraZoomRest,
    });
  });
});

describe("stepCamera", () => {
  it("moves toward the target without reaching it in one short step", () => {
    const next = stepCamera(
      STATE,
      { x: 1800, y: 800, speedFraction: 0 },
      1 / 60,
      VIEWPORT,
      ARENA,
    );
    expect(next.x).toBeGreaterThan(1200);
    expect(next.x).toBeLessThan(1800);
  });

  it("converges to the target over time", () => {
    let state = STATE;
    for (let i = 0; i < 600; i += 1) {
      state = stepCamera(
        state,
        { x: 1500, y: 900, speedFraction: 0 },
        1 / 60,
        VIEWPORT,
        ARENA,
      );
    }
    expect(state.x).toBeCloseTo(1500, 3);
    expect(state.y).toBeCloseTo(900, 3);
  });

  it("keeps zero dt as identity for position", () => {
    const next = stepCamera(
      STATE,
      { x: 500, y: 500, speedFraction: 0 },
      0,
      VIEWPORT,
      ARENA,
    );
    expect(next.x).toBe(1200);
    expect(next.y).toBe(800);
  });

  it("settles zoom at cameraZoomRest when the car is at rest", () => {
    const state = settle({ x: 1200, y: 800, speedFraction: 0 }, STATE);
    expect(state.zoom).toBeCloseTo(gameConfig.cameraZoomRest, 3);
  });

  it("settles zoom at cameraZoomMoving at full speed", () => {
    const state = settle({ x: 1200, y: 800, speedFraction: 1 }, STATE);
    expect(state.zoom).toBeCloseTo(gameConfig.cameraZoomMoving, 3);
  });

  it("zooms in at rest and out at speed (rest is closer than moving)", () => {
    expect(gameConfig.cameraZoomRest).toBeGreaterThan(
      gameConfig.cameraZoomMoving,
    );
    expect(zoomForSpeed(0)).toBe(gameConfig.cameraZoomRest);
    expect(zoomForSpeed(1)).toBe(gameConfig.cameraZoomMoving);
    expect(zoomForSpeed(0.5)).toBeCloseTo(
      Math.sqrt(gameConfig.cameraZoomRest * gameConfig.cameraZoomMoving),
      10,
    );
  });

  it("shows at least 2.5x the rest visible area at full speed", () => {
    const restArea = 1 / (zoomForSpeed(0) * zoomForSpeed(0));
    const fullArea = 1 / (zoomForSpeed(1) * zoomForSpeed(1));
    expect(fullArea / restArea).toBeGreaterThanOrEqual(2.5);
  });

  it("widens the view faster than it closes in", () => {
    expect(gameConfig.cameraZoomOutLerp).toBeGreaterThan(
      gameConfig.cameraFollowLerp,
    );
  });

  it("covers a larger fraction of the zoom distance per step when widening", () => {
    const start = 1;
    const widenTarget = gameConfig.cameraZoomMoving;
    const closeTarget = gameConfig.cameraZoomRest;
    const widen = stepCamera(
      { x: 1200, y: 800, zoom: start },
      { x: 1200, y: 800, speedFraction: 1 },
      1 / 60,
      VIEWPORT,
      ARENA,
    );
    const close = stepCamera(
      { x: 1200, y: 800, zoom: start },
      { x: 1200, y: 800, speedFraction: 0 },
      1 / 60,
      VIEWPORT,
      ARENA,
    );
    const widenFraction = (start - widen.zoom) / (start - widenTarget);
    const closeFraction = (close.zoom - start) / (closeTarget - start);
    expect(widenFraction).toBeGreaterThan(closeFraction);
  });

  it("clamps speedFraction to 0..1 for zoom", () => {
    expect(zoomForSpeed(-5)).toBe(gameConfig.cameraZoomRest);
    expect(zoomForSpeed(5)).toBe(gameConfig.cameraZoomMoving);
  });

  it("clamps the centre so the visible area stays inside the arena at rest zoom", () => {
    const state = settle({ x: 0, y: 0, speedFraction: 0 }, STATE);
    const halfW = VIEWPORT.width / (2 * state.zoom);
    const halfH = VIEWPORT.height / (2 * state.zoom);
    expect(state.x).toBeCloseTo(halfW, 3);
    expect(state.y).toBeCloseTo(halfH, 3);
  });

  it("clamps the far edge as well at rest zoom", () => {
    const state = settle(
      { x: ARENA.width, y: ARENA.height, speedFraction: 0 },
      STATE,
    );
    const halfW = VIEWPORT.width / (2 * state.zoom);
    const halfH = VIEWPORT.height / (2 * state.zoom);
    expect(state.x).toBeCloseTo(ARENA.width - halfW, 3);
    expect(state.y).toBeCloseTo(ARENA.height - halfH, 3);
  });

  it("centres the arena when the viewport is larger than the arena", () => {
    const huge = { width: 5000, height: 4000 };
    const next = stepCamera(
      { x: 100, y: 100, zoom: 1 },
      { x: 100, y: 100, speedFraction: 0 },
      1,
      huge,
      ARENA,
    );
    expect(next.x).toBe(ARENA.width / 2);
    expect(next.y).toBe(ARENA.height / 2);
  });
});
