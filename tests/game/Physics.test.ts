import { describe, expect, it } from "vitest";
import { gameConfig } from "../../src/config/gameConfig";
import { PhysicsWorld } from "../../src/game/Physics";

const ARENA = {
  width: gameConfig.arenaWidth,
  height: gameConfig.arenaHeight,
  wallThickness: gameConfig.wallThickness,
};
const IDLE = { throttle: 0, steer: 0, boost: false } as const;
const FULL = { throttle: 1, steer: 0, boost: false } as const;

function createWorld(): PhysicsWorld {
  return new PhysicsWorld(ARENA, []);
}

describe("PhysicsWorld", () => {
  it("keeps a car at rest in place over 600 steps", () => {
    const world = createWorld();
    world.addCar(1, 600, 800, 0);
    const start = world.getCar(1);
    for (let i = 0; i < 600; i += 1) {
      world.applyControl(1, IDLE, false);
      world.step();
    }
    const end = world.getCar(1);
    expect(end?.x).toBeCloseTo(start?.x ?? NaN, 3);
    expect(end?.y).toBeCloseTo(start?.y ?? NaN, 3);
    expect(end?.speed).toBeLessThan(0.01);
    world.dispose();
  });

  it("accelerates forward under full throttle without turning", () => {
    const world = createWorld();
    world.addCar(1, 600, 800, 0);
    const start = world.getCar(1);
    for (let i = 0; i < 60; i += 1) {
      world.applyControl(1, FULL, false);
      world.step();
    }
    const end = world.getCar(1);
    expect(end?.vx ?? 0).toBeGreaterThan(0);
    expect(end?.x ?? 0).toBeGreaterThan(start?.x ?? Infinity);
    expect(end?.angle ?? NaN).toBeCloseTo(0, 6);
    world.dispose();
  });

  it("reaches arcade speed quickly under full throttle", () => {
    const world = createWorld();
    world.addCar(1, 600, 800, 0);
    for (let i = 0; i < 60; i += 1) {
      world.applyControl(1, FULL, false);
      world.step();
    }
    expect(world.getCar(1)?.speed ?? 0).toBeGreaterThan(330);
    world.dispose();
  });

  it("does not spin while stationary and steers once moving", () => {
    const world = createWorld();
    world.addCar(1, 600, 800, 0);

    for (let i = 0; i < 60; i += 1) {
      world.applyControl(1, { throttle: 0, steer: 1, boost: false }, false);
      world.step();
    }
    expect(world.getCar(1)?.angle).toBeCloseTo(0, 6);

    for (let i = 0; i < 60; i += 1) {
      world.applyControl(1, { throttle: 1, steer: 1, boost: false }, false);
      world.step();
    }
    expect(world.getCar(1)?.angle ?? 0).toBeGreaterThan(0.2);
    world.dispose();
  });

  it("loses speed on impact with the right wall and stays inside it", () => {
    const world = createWorld();
    const wallInnerEdge = gameConfig.arenaWidth;
    const carHalfLength = gameConfig.carWidth / 2;
    world.addCar(1, wallInnerEdge - 300, 800, 0);
    let maxSpeed = 0;
    let speedAfterImpact = Infinity;
    let impacted = false;
    let maxX = -Infinity;
    for (let i = 0; i < 240; i += 1) {
      world.applyControl(1, FULL, false);
      const contacts = world.step();
      const state = world.getCar(1);
      if (!state) throw new Error("car missing");
      maxSpeed = Math.max(maxSpeed, state.speed);
      maxX = Math.max(maxX, state.x);
      if (!impacted && contacts.some((c) => c.kind === "car-wall")) {
        impacted = true;
        speedAfterImpact = state.speed;
      }
    }
    expect(impacted).toBe(true);
    expect(speedAfterImpact).toBeLessThan(maxSpeed);
    expect(maxX + carHalfLength).toBeLessThanOrEqual(wallInnerEdge + 1);
    world.dispose();
  });

  it("deflects away from the right wall under held throttle", () => {
    const world = createWorld();
    world.addCar(1, gameConfig.arenaWidth - 300, 800, 0);
    const WINDOW_STEPS = 30;
    let impactStep = -1;
    let minVx = Infinity;
    for (let i = 0; i < 240; i += 1) {
      world.applyControl(1, FULL, false);
      const contacts = world.step();
      const state = world.getCar(1);
      if (!state) throw new Error("car missing");
      if (impactStep < 0 && contacts.some((c) => c.kind === "car-wall")) {
        impactStep = i;
      }
      if (impactStep >= 0 && i - impactStep <= WINDOW_STEPS) {
        minVx = Math.min(minVx, state.vx);
      }
    }
    expect(impactStep).toBeGreaterThanOrEqual(0);
    expect(minVx).toBeLessThan(0);
    world.dispose();
  });

  it("bounces two head-on cars back along the collision axis after a crash", () => {
    const world = createWorld();
    world.addCar(1, 600, 800, 0);
    world.addCar(2, 1000, 800, Math.PI);
    const WINDOW_STEPS = 30;
    let impactStep = -1;
    let minVxA = Infinity;
    let maxVxB = -Infinity;
    for (let i = 0; i < 240; i += 1) {
      const control = impactStep < 0 ? FULL : IDLE;
      world.applyControl(1, control, false);
      world.applyControl(2, control, false);
      const contacts = world.step();
      if (impactStep < 0 && contacts.some((c) => c.kind === "car-car")) {
        impactStep = i;
      }
      if (impactStep >= 0 && i - impactStep <= WINDOW_STEPS) {
        minVxA = Math.min(minVxA, world.getCar(1)?.vx ?? Infinity);
        maxVxB = Math.max(maxVxB, world.getCar(2)?.vx ?? -Infinity);
      }
    }
    expect(impactStep).toBeGreaterThanOrEqual(0);
    expect(minVxA).toBeLessThan(0);
    expect(maxVxB).toBeGreaterThan(0);
    world.dispose();
  });

  it("bounces a car off the right wall when it hits at speed", () => {
    const world = createWorld();
    world.addCar(1, gameConfig.arenaWidth - 300, 800, 0);
    const WINDOW_STEPS = 30;
    let impactStep = -1;
    let minVx = Infinity;
    for (let i = 0; i < 240; i += 1) {
      const control = impactStep < 0 ? FULL : IDLE;
      world.applyControl(1, control, false);
      const contacts = world.step();
      if (impactStep < 0 && contacts.some((c) => c.kind === "car-wall")) {
        impactStep = i;
      }
      if (impactStep >= 0 && i - impactStep <= WINDOW_STEPS) {
        minVx = Math.min(minVx, world.getCar(1)?.vx ?? Infinity);
      }
    }
    expect(impactStep).toBeGreaterThanOrEqual(0);
    expect(minVx).toBeLessThan(0);
    world.dispose();
  });

  it("slides along the right wall instead of pinning when driven in at an angle", () => {
    const world = createWorld();
    const angle = 0.4;
    world.addCar(1, gameConfig.arenaWidth - 300, 800, angle);
    const SLIDE_STEPS = 60;
    let impactStep = -1;
    let yAtImpact = 0;
    let yAfter = 0;
    for (let i = 0; i < 240; i += 1) {
      world.applyControl(1, FULL, false);
      const contacts = world.step();
      const state = world.getCar(1);
      if (!state) throw new Error("car missing");
      if (impactStep < 0 && contacts.some((c) => c.kind === "car-wall")) {
        impactStep = i;
        yAtImpact = state.y;
      }
      if (impactStep >= 0 && i - impactStep === SLIDE_STEPS) {
        yAfter = state.y;
      }
    }
    expect(impactStep).toBeGreaterThanOrEqual(0);
    expect(Math.abs(yAfter - yAtImpact)).toBeGreaterThan(5);
    world.dispose();
  });
});
