import Matter from "matter-js";
import { gameConfig } from "../../config/gameConfig";
import type { CarBodyState, PhysicsArena, PhysicsBase } from "./types";

const FIXED_STEP_HZ = gameConfig.fixedStepHz;

const CATEGORY = { car: 0x0001, wall: 0x0002, sensor: 0x0004 } as const;
const CAR_MASK = CATEGORY.car | CATEGORY.wall | CATEGORY.sensor;

export function createCarBody(
  x: number,
  y: number,
  angleRad: number,
): Matter.Body {
  const body = Matter.Bodies.rectangle(
    x,
    y,
    gameConfig.carWidth,
    gameConfig.carHeight,
    {
      frictionAir: gameConfig.airFriction,
      friction: gameConfig.carFriction,
      restitution: gameConfig.carRestitution,
      collisionFilter: { category: CATEGORY.car, mask: CAR_MASK },
    },
  );
  Matter.Body.setMass(body, gameConfig.carMass);
  Matter.Body.setAngle(body, angleRad);
  return body;
}

export function createBillBody(x: number, y: number): Matter.Body {
  return Matter.Bodies.circle(x, y, gameConfig.billRadius, {
    isStatic: true,
    isSensor: true,
    collisionFilter: { category: CATEGORY.sensor, mask: CATEGORY.car },
  });
}

export function createWallBodies(arena: PhysicsArena): Matter.Body[] {
  const { width: w, height: h, wallThickness: t } = arena;
  const segments = [
    { x: w / 2, y: -t / 2, width: w + 2 * t, height: t },
    { x: w / 2, y: h + t / 2, width: w + 2 * t, height: t },
    { x: -t / 2, y: h / 2, width: t, height: h },
    { x: w + t / 2, y: h / 2, width: t, height: h },
  ];
  return segments.map((segment) =>
    Matter.Bodies.rectangle(
      segment.x,
      segment.y,
      segment.width,
      segment.height,
      {
        isStatic: true,
        friction: gameConfig.wallFriction,
        restitution: gameConfig.wallRestitution,
        collisionFilter: { category: CATEGORY.wall, mask: CATEGORY.car },
      },
    ),
  );
}

export function createBaseBody(base: PhysicsBase): Matter.Body {
  return Matter.Bodies.rectangle(base.x, base.y, base.width, base.height, {
    isStatic: true,
    isSensor: true,
    collisionFilter: { category: CATEGORY.sensor, mask: CATEGORY.car },
  });
}

export function carStateOf(pid: number, body: Matter.Body): CarBodyState {
  const vx = body.velocity.x * FIXED_STEP_HZ;
  const vy = body.velocity.y * FIXED_STEP_HZ;
  return {
    pid,
    x: body.position.x,
    y: body.position.y,
    angle: body.angle,
    vx,
    vy,
    speed: Math.hypot(vx, vy),
  };
}
