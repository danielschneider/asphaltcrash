import { describe, expect, it } from "vitest";
import { gameConfig } from "../../src/config/gameConfig";
import {
  createCamera,
  fitZoomForArena,
  stepCamera,
  zoomForSpeed,
  zoomScaleForArena,
  type CameraState,
  type CameraTarget,
} from "../../src/game/Camera";

const ARENA = { width: 2400, height: 1600 };
const VIEWPORT = { width: 1000, height: 700 };
const STATE: CameraState = cameraAt(1200, 800, 1);
const SETTLE_STEPS = 600;
const FRAME = 1 / 60;

function cameraAt(
  x: number,
  y: number,
  zoom: number,
  extra: Partial<CameraState> = {},
): CameraState {
  return {
    x,
    y,
    zoom,
    zoomTarget: zoom,
    zoomDwellS: 0,
    zoomDwellSign: 0,
    speedSmooth: 0,
    ...extra,
  };
}

function settle(target: CameraTarget, start: CameraState): CameraState {
  let state = start;
  for (let i = 0; i < SETTLE_STEPS; i += 1) {
    state = stepCamera(state, target, FRAME, VIEWPORT, ARENA);
  }
  return state;
}

describe("createCamera", () => {
  it("starts centred on the arena at rest zoom", () => {
    expect(createCamera(ARENA)).toEqual({
      x: 1200,
      y: 800,
      zoom: gameConfig.cameraZoomRest,
      zoomTarget: gameConfig.cameraZoomRest,
      zoomDwellS: 0,
      zoomDwellSign: 0,
      speedSmooth: 0,
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

  it("does not change zoom target while speed change is within the dead time", () => {
    const holdFrames = Math.floor(gameConfig.cameraZoomOutHoldS / FRAME) - 2;
    let state = cameraAt(1200, 800, gameConfig.cameraZoomRest);
    for (let i = 0; i < holdFrames; i += 1) {
      state = stepCamera(
        state,
        { x: 1200, y: 800, speedFraction: 1 },
        FRAME,
        VIEWPORT,
        ARENA,
      );
    }
    expect(state.zoomTarget).toBe(gameConfig.cameraZoomRest);
    expect(state.zoom).toBe(gameConfig.cameraZoomRest);
  });

  it("changes zoom target after the dead time elapsed", () => {
    const state = settle(
      { x: 1200, y: 800, speedFraction: 1 },
      cameraAt(1200, 800, gameConfig.cameraZoomRest),
    );
    expect(state.zoomTarget).toBeCloseTo(gameConfig.cameraZoomMoving, 10);
    expect(state.zoom).toBeLessThan(gameConfig.cameraZoomRest);
  });

  it("resets the dead time when speed returns to the current target", () => {
    let state = cameraAt(1200, 800, gameConfig.cameraZoomRest);
    for (let i = 0; i < 10; i += 1) {
      state = stepCamera(
        state,
        { x: 1200, y: 800, speedFraction: 1 },
        FRAME,
        VIEWPORT,
        ARENA,
      );
    }
    state = settle({ x: 1200, y: 800, speedFraction: 0 }, state);
    expect(state.zoomDwellS).toBe(0);
    expect(state.zoomTarget).toBe(gameConfig.cameraZoomRest);
  });

  it("filters a single speed spike so the zoom target does not move", () => {
    const start = settle({ x: 1200, y: 800, speedFraction: 0 }, STATE);
    const spike = stepCamera(
      start,
      { x: 1200, y: 800, speedFraction: 1 },
      FRAME,
      VIEWPORT,
      ARENA,
    );
    expect(spike.speedSmooth).toBeLessThan(0.1);
    expect(spike.zoomTarget).toBe(start.zoomTarget);
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
      cameraAt(1200, 800, start, {
        zoomTarget: widenTarget,
        zoomDwellS: 10,
        zoomDwellSign: -1,
      }),
      { x: 1200, y: 800, speedFraction: 1 },
      1 / 60,
      VIEWPORT,
      ARENA,
    );
    const close = stepCamera(
      cameraAt(1200, 800, start, {
        zoomTarget: closeTarget,
        zoomDwellS: 10,
        zoomDwellSign: 1,
      }),
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
      cameraAt(100, 100, 1),
      { x: 100, y: 100, speedFraction: 0 },
      1,
      huge,
      ARENA,
    );
    expect(next.x).toBe(ARENA.width / 2);
    expect(next.y).toBe(ARENA.height / 2);
  });
});

describe("fitZoomForArena", () => {
  it("fits the whole arena in a landscape viewport with the fit margin", () => {
    const arena = { width: 1600, height: 1200 };
    const zoom = fitZoomForArena({ width: 1600, height: 1000 }, arena);
    expect(zoom).toBeCloseTo(
      Math.min(1.0, 1000 / 1200) * gameConfig.crashfestFitMargin,
      10,
    );
    expect(arena.width * zoom).toBeLessThanOrEqual(1600);
    expect(arena.height * zoom).toBeLessThanOrEqual(1000);
  });

  it("is limited by width in a portrait viewport", () => {
    const arena = { width: 1600, height: 1200 };
    const zoom = fitZoomForArena({ width: 800, height: 1400 }, arena);
    expect(zoom).toBeCloseTo(0.5 * gameConfig.crashfestFitMargin, 10);
  });
});

describe("zoomScaleForArena", () => {
  it("is 1 for the Cash Run arena", () => {
    expect(
      zoomScaleForArena({
        width: gameConfig.arenaWidth,
        height: gameConfig.arenaHeight,
      }),
    ).toBe(1);
  });

  it("keeps the visible share of the field equal across arena sizes at full speed", () => {
    const crash = { width: 1600, height: 1200 };
    const cash = {
      width: gameConfig.arenaWidth,
      height: gameConfig.arenaHeight,
    };
    const shareAt = (arena: { width: number }, scale: number): number => {
      const zoom = zoomForSpeed(1, scale);
      return VIEWPORT.width / zoom / arena.width;
    };
    expect(shareAt(crash, zoomScaleForArena(crash))).toBeCloseTo(
      shareAt(cash, zoomScaleForArena(cash)),
      10,
    );
  });
});

describe("stepCamera with fitZoom", () => {
  const ARENA_FIT = { width: 1600, height: 1200 };
  const FIT_VIEWPORT = { width: 1600, height: 1000 };

  it("settles on the fit zoom and arena centre", () => {
    const fitZoom = fitZoomForArena(FIT_VIEWPORT, ARENA_FIT);
    let state: CameraState = cameraAt(100, 100, 1.5);
    for (let i = 0; i < SETTLE_STEPS; i += 1) {
      state = stepCamera(
        state,
        { x: 100, y: 100, speedFraction: 1, fitZoom },
        1 / 60,
        FIT_VIEWPORT,
        ARENA_FIT,
      );
    }
    expect(state.zoom).toBeCloseTo(fitZoom, 4);
    expect(state.x).toBeCloseTo(800, 3);
    expect(state.y).toBeCloseTo(600, 3);
  });

  it("ignores speed when fitZoom is set", () => {
    const next = stepCamera(
      cameraAt(800, 600, 1),
      { x: 800, y: 600, speedFraction: 0, fitZoom: 0.4 },
      1 / 60,
      FIT_VIEWPORT,
      ARENA_FIT,
    );
    expect(next.zoom).toBeLessThan(1);
    expect(next.zoom).toBeGreaterThan(0.4);
  });
});
