import Matter from "matter-js";
import { gameConfig } from "../config/gameConfig";
import { MS_PER_SECOND } from "./sim/time";
import type { AimDrive } from "./sim/aimDrive";
import {
  applySteer,
  applyThrottle,
  decideDrive,
  forwardCapFor,
  forwardPxsOf,
  headingFrame,
  lateralComponent,
} from "./physics/carControl";
import {
  applyRamKicks,
  collectContacts,
  collectWallNormals,
} from "./physics/contacts";
import {
  carStateOf,
  createBaseBody,
  createBillBody,
  createCarBody,
  createWallBodies,
} from "./physics/bodies";
import type {
  BodyMeta,
  CarBodyState,
  CarControl,
  PhysicsArena,
  PhysicsBase,
  PhysicsContact,
} from "./physics/types";
import { clamp, reflectOffWalls, ZERO, type Vec2 } from "./physics/vec";

export type {
  CarBodyState,
  CarControl,
  PhysicsArena,
  PhysicsBase,
  PhysicsContact,
} from "./physics/types";

const FIXED_STEP_HZ = gameConfig.fixedStepHz;
const STEP_MS = MS_PER_SECOND / FIXED_STEP_HZ;
const NO_PID = -1;
const NO_DRIVE: AimDrive = { steer: 0, throttle: 0 };
const NO_NORMALS: readonly Vec2[] = [];
export class PhysicsWorld {
  private readonly engine: Matter.Engine;
  private readonly cars = new Map<number, Matter.Body>();
  private readonly bills = new Map<number, Matter.Body>();
  private readonly metaByBodyId = new Map<number, BodyMeta>();
  private readonly pairs: Matter.Pair[] = [];
  private wallNormals = new Map<number, Vec2[]>();
  private readonly reverseSteps = new Map<number, number>();
  private readonly wrecked = new Set<number>();
  private readonly handleCollision = (
    event: Matter.IEventCollision<Matter.Engine>,
  ): void => {
    this.pairs.push(...event.pairs);
  };
  private readonly metaOf = (bodyId: number): BodyMeta | undefined =>
    this.metaByBodyId.get(bodyId);

  constructor(arena: PhysicsArena, bases: readonly PhysicsBase[]) {
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      enableSleeping: false,
    });
    for (const wall of createWallBodies(arena)) {
      this.addStaticBody(wall, { kind: "wall", pid: NO_PID, billId: null });
    }
    for (const base of bases) {
      this.addStaticBody(createBaseBody(base), {
        kind: "base",
        pid: base.pid,
        billId: null,
      });
    }
    Matter.Events.on(this.engine, "collisionStart", this.handleCollision);
    Matter.Events.on(this.engine, "collisionActive", this.handleCollision);
  }

  addCar(pid: number, x: number, y: number, angleRad: number): void {
    this.removeCar(pid);
    const body = createCarBody(x, y, angleRad);
    Matter.Composite.add(this.engine.world, body);
    this.cars.set(pid, body);
    this.metaByBodyId.set(body.id, { kind: "car", pid, billId: null });
  }

  removeCar(pid: number): void {
    const body = this.cars.get(pid);
    if (!body) return;
    this.dropBody(body);
    this.cars.delete(pid);
    this.reverseSteps.delete(pid);
    this.wrecked.delete(pid);
  }

  // Wrecks stay dynamic so live cars can shove them; extra air drag stops them sliding across the arena.
  setCarWrecked(pid: number, wrecked: boolean): void {
    const body = this.cars.get(pid);
    if (!body) return;
    if (wrecked) {
      this.wrecked.add(pid);
    } else {
      this.wrecked.delete(pid);
    }
    body.frictionAir = wrecked
      ? gameConfig.wreckFrictionAir
      : gameConfig.airFriction;
  }

  teleportCar(pid: number, x: number, y: number, angleRad: number): void {
    const body = this.cars.get(pid);
    if (!body) return;
    Matter.Body.setPosition(body, { x, y });
    Matter.Body.setAngle(body, angleRad);
    Matter.Body.setVelocity(body, ZERO);
    Matter.Body.setAngularVelocity(body, 0);
  }

  addBill(billId: number, x: number, y: number): void {
    this.removeBill(billId);
    const body = createBillBody(x, y);
    Matter.Composite.add(this.engine.world, body);
    this.bills.set(billId, body);
    this.metaByBodyId.set(body.id, { kind: "bill", pid: NO_PID, billId });
  }

  removeBill(billId: number): void {
    const body = this.bills.get(billId);
    if (!body) return;
    this.dropBody(body);
    this.bills.delete(billId);
  }

  applyControl(
    pid: number,
    control: CarControl,
    boostActive: boolean,
  ): AimDrive {
    const body = this.cars.get(pid);
    if (!body || body.isStatic || this.wrecked.has(pid)) return NO_DRIVE;

    const { heading, side } = headingFrame(body.angle);
    const forwardCap = forwardCapFor(boostActive);
    const lateral = lateralComponent(body.velocity, side);
    // Speed limits constrain powered motion; clipping here would erase momentum when the car rotates through its velocity.
    const rawForwardPxs = forwardPxsOf(body.velocity, heading);
    const forwardPxs = clamp(
      rawForwardPxs,
      -gameConfig.maxReverseSpeed,
      forwardCap,
    );
    const normals = this.wallNormals.get(pid) ?? NO_NORMALS;
    Matter.Body.setVelocity(
      body,
      reflectOffWalls(
        {
          x: heading.x * (rawForwardPxs / FIXED_STEP_HZ) + side.x * lateral,
          y: heading.y * (rawForwardPxs / FIXED_STEP_HZ) + side.y * lateral,
        },
        normals,
        gameConfig.wallRestitution,
      ),
    );

    const drive = this.driveFor(pid, body, control, forwardPxs, normals);
    applySteer(body, drive.steer);
    applyThrottle(
      body,
      heading,
      drive.throttle,
      forwardPxs,
      forwardCap,
      normals,
    );
    return drive;
  }

  step(): PhysicsContact[] {
    const preVelocities = new Map<number, Vec2>();
    for (const body of this.cars.values()) {
      preVelocities.set(body.id, { x: body.velocity.x, y: body.velocity.y });
    }
    this.pairs.length = 0;
    Matter.Engine.update(this.engine, STEP_MS);
    const contacts = collectContacts(this.pairs, preVelocities, this.metaOf);
    applyRamKicks(contacts, preVelocities, (pid) => this.cars.get(pid));
    this.wallNormals = collectWallNormals(this.pairs, this.metaOf);
    this.pairs.length = 0;
    return contacts;
  }

  getCar(pid: number): CarBodyState | null {
    const body = this.cars.get(pid);
    return body ? carStateOf(pid, body) : null;
  }

  carStates(): CarBodyState[] {
    return [...this.cars.keys()]
      .sort((a, b) => a - b)
      .map((pid) => carStateOf(pid, this.cars.get(pid) as Matter.Body));
  }

  dispose(): void {
    Matter.Events.off(this.engine, "collisionStart", this.handleCollision);
    Matter.Events.off(this.engine, "collisionActive", this.handleCollision);
    Matter.Composite.clear(this.engine.world, false);
    Matter.Engine.clear(this.engine);
    this.cars.clear();
    this.reverseSteps.clear();
    this.wrecked.clear();
    this.bills.clear();
    this.metaByBodyId.clear();
    this.pairs.length = 0;
    this.wallNormals = new Map();
  }

  private addStaticBody(body: Matter.Body, meta: BodyMeta): void {
    Matter.Composite.add(this.engine.world, body);
    this.metaByBodyId.set(body.id, meta);
  }

  private dropBody(body: Matter.Body): void {
    Matter.Composite.remove(this.engine.world, body);
    this.metaByBodyId.delete(body.id);
  }

  private driveFor(
    pid: number,
    body: Matter.Body,
    control: CarControl,
    forwardPxs: number,
    normals: readonly Vec2[],
  ): AimDrive {
    const decision = decideDrive(
      control.aimX,
      control.aimY,
      body.angle,
      forwardPxs,
      normals,
      this.reverseSteps.get(pid) ?? 0,
    );
    this.reverseSteps.set(pid, decision.reverseSteps);
    return decision.drive;
  }
}
