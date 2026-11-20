import Matter from "matter-js";
import { gameConfig } from "../config/gameConfig";
import { MS_PER_SECOND } from "./sim/time";

export interface PhysicsContact {
  readonly kind: "car-car" | "car-wall" | "car-bill" | "car-base";
  readonly aPid: number;
  readonly bPid: number | null;
  readonly billId: number | null;
  readonly impulse: number;
  readonly rammerPid: number | null;
}

export interface CarBodyState {
  readonly pid: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
}

export interface CarControl {
  readonly throttle: number;
  readonly steer: number;
  readonly boost: boolean;
}

export interface PhysicsArena {
  readonly width: number;
  readonly height: number;
  readonly wallThickness: number;
}

export interface PhysicsBase {
  readonly pid: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type BodyKind = "car" | "wall" | "bill" | "base";

interface BodyMeta {
  readonly kind: BodyKind;
  readonly pid: number;
  readonly billId: number | null;
}

interface Vec2 {
  readonly x: number;
  readonly y: number;
}

const FIXED_STEP_HZ = gameConfig.fixedStepHz;
const STEP_MS = MS_PER_SECOND / FIXED_STEP_HZ;
// Matter applies force as dv = F/m * deltaMs^2 with deltaMs in ms. Converting to px/s^2 gives F = m * a / MS_PER_SECOND^2.
const FORCE_PER_ACCEL = 1 / (MS_PER_SECOND * MS_PER_SECOND);
const NO_PID = -1;
const CATEGORY = { car: 0x0001, wall: 0x0002, sensor: 0x0004 } as const;
const CAR_MASK = CATEGORY.car | CATEGORY.wall | CATEGORY.sensor;
const ZERO: Vec2 = { x: 0, y: 0 };
const NO_NORMALS: readonly Vec2[] = [];

export class PhysicsWorld {
  private readonly engine: Matter.Engine;
  private readonly cars = new Map<number, Matter.Body>();
  private readonly bills = new Map<number, Matter.Body>();
  private readonly metaByBodyId = new Map<number, BodyMeta>();
  private readonly pairs: Matter.Pair[] = [];
  private wallNormals = new Map<number, Vec2[]>();
  private readonly handleCollision = (
    event: Matter.IEventCollision<Matter.Engine>,
  ): void => {
    this.pairs.push(...event.pairs);
  };

  constructor(arena: PhysicsArena, bases: readonly PhysicsBase[]) {
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      enableSleeping: false,
    });
    this.addWalls(arena);
    for (const base of bases) {
      this.addBase(base);
    }
    Matter.Events.on(this.engine, "collisionStart", this.handleCollision);
    Matter.Events.on(this.engine, "collisionActive", this.handleCollision);
  }

  addCar(pid: number, x: number, y: number, angleRad: number): void {
    this.removeCar(pid);
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
    Matter.Composite.add(this.engine.world, body);
    this.cars.set(pid, body);
    this.metaByBodyId.set(body.id, { kind: "car", pid, billId: null });
  }

  removeCar(pid: number): void {
    const body = this.cars.get(pid);
    if (!body) return;
    this.dropBody(body);
    this.cars.delete(pid);
  }

  setCarFrozen(pid: number, frozen: boolean): void {
    const body = this.cars.get(pid);
    if (!body) return;
    Matter.Body.setStatic(body, frozen);
    if (frozen) {
      Matter.Body.setVelocity(body, ZERO);
      Matter.Body.setAngularVelocity(body, 0);
    }
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
    const body = Matter.Bodies.circle(x, y, gameConfig.billRadius, {
      isStatic: true,
      isSensor: true,
      collisionFilter: { category: CATEGORY.sensor, mask: CATEGORY.car },
    });
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

  applyControl(pid: number, control: CarControl, boostActive: boolean): void {
    const body = this.cars.get(pid);
    if (!body || body.isStatic) return;

    const heading = headingOf(body.angle);
    const side = { x: -heading.y, y: heading.x };
    const forwardCap =
      gameConfig.maxForwardSpeed +
      (boostActive ? gameConfig.boostSpeedBonus : 0);
    // lateralGrip is the fraction removed per second; per fixed step it is lateralGrip / 60 of the sideways speed.
    const lateral =
      dot(body.velocity, side) * (1 - gameConfig.lateralGrip / FIXED_STEP_HZ);
    const forwardPxs = clamp(
      dot(body.velocity, heading) * FIXED_STEP_HZ,
      -gameConfig.maxReverseSpeed,
      forwardCap,
    );
    const normals = this.wallNormals.get(pid) ?? NO_NORMALS;
    Matter.Body.setVelocity(
      body,
      reflectOffWalls(
        {
          x: heading.x * (forwardPxs / FIXED_STEP_HZ) + side.x * lateral,
          y: heading.y * (forwardPxs / FIXED_STEP_HZ) + side.y * lateral,
        },
        normals,
      ),
    );

    this.applySteer(body, clamp(control.steer, -1, 1), forwardPxs);
    this.applyThrottle(
      body,
      heading,
      clamp(control.throttle, -1, 1),
      forwardPxs,
      forwardCap,
      normals,
    );
  }

  step(): PhysicsContact[] {
    const preVelocities = new Map<number, Vec2>();
    for (const body of this.cars.values()) {
      preVelocities.set(body.id, { x: body.velocity.x, y: body.velocity.y });
    }
    this.pairs.length = 0;
    Matter.Engine.update(this.engine, STEP_MS);
    const contacts = this.collectContacts(preVelocities);
    this.wallNormals = this.collectWallNormals();
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
    this.bills.clear();
    this.metaByBodyId.clear();
    this.pairs.length = 0;
    this.wallNormals = new Map();
  }

  private addWalls(arena: PhysicsArena): void {
    const { width: w, height: h, wallThickness: t } = arena;
    const segments = [
      { x: w / 2, y: -t / 2, width: w + 2 * t, height: t },
      { x: w / 2, y: h + t / 2, width: w + 2 * t, height: t },
      { x: -t / 2, y: h / 2, width: t, height: h },
      { x: w + t / 2, y: h / 2, width: t, height: h },
    ];
    for (const segment of segments) {
      const body = Matter.Bodies.rectangle(
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
      );
      this.addStaticBody(body, { kind: "wall", pid: NO_PID, billId: null });
    }
  }

  private addBase(base: PhysicsBase): void {
    const body = Matter.Bodies.rectangle(
      base.x,
      base.y,
      base.width,
      base.height,
      {
        isStatic: true,
        isSensor: true,
        collisionFilter: { category: CATEGORY.sensor, mask: CATEGORY.car },
      },
    );
    this.addStaticBody(body, { kind: "base", pid: base.pid, billId: null });
  }

  private addStaticBody(body: Matter.Body, meta: BodyMeta): void {
    Matter.Composite.add(this.engine.world, body);
    this.metaByBodyId.set(body.id, meta);
  }

  private dropBody(body: Matter.Body): void {
    Matter.Composite.remove(this.engine.world, body);
    this.metaByBodyId.delete(body.id);
  }

  private applySteer(
    body: Matter.Body,
    steer: number,
    forwardPxs: number,
  ): void {
    if (steer === 0) {
      Matter.Body.setAngularVelocity(body, 0);
      return;
    }
    const speedFraction = clamp(
      (Math.hypot(body.velocity.x, body.velocity.y) * FIXED_STEP_HZ) /
        gameConfig.maxForwardSpeed,
      0,
      1,
    );
    const steerEngagement = clamp(
      speedFraction / gameConfig.steerFullEngagementSpeedFraction,
      0,
      1,
    );
    const steerScale = 1 - gameConfig.steerSpeedPenalty * speedFraction;
    const direction = forwardPxs < 0 ? -1 : 1;
    Matter.Body.setAngularVelocity(
      body,
      (steer *
        direction *
        gameConfig.steerRateRadPerSec *
        steerEngagement *
        steerScale) /
        FIXED_STEP_HZ,
    );
  }

  private applyThrottle(
    body: Matter.Body,
    heading: Vec2,
    throttle: number,
    forwardPxs: number,
    forwardCap: number,
    normals: readonly Vec2[],
  ): void {
    const accel = throttleAccel(throttle, forwardPxs, forwardCap);
    if (accel === 0) return;
    const force = accel * gameConfig.carMass * FORCE_PER_ACCEL;
    Matter.Body.applyForce(
      body,
      body.position,
      removeIntoWalls({ x: heading.x * force, y: heading.y * force }, normals),
    );
  }

  private collectWallNormals(): Map<number, Vec2[]> {
    const normals = new Map<number, Vec2[]>();
    for (const pair of this.pairs) {
      const first = this.metaByBodyId.get(pair.bodyA.id);
      const second = this.metaByBodyId.get(pair.bodyB.id);
      if (!first || !second) continue;
      if (first.kind === "car" && second.kind === "wall") {
        pushNormal(normals, first.pid, negate(pair.collision.normal));
      } else if (first.kind === "wall" && second.kind === "car") {
        pushNormal(normals, second.pid, pair.collision.normal);
      }
    }
    return normals;
  }

  private collectContacts(
    preVelocities: ReadonlyMap<number, Vec2>,
  ): PhysicsContact[] {
    const seen = new Set<string>();
    const contacts: PhysicsContact[] = [];
    for (const pair of this.pairs) {
      const key = pairKey(pair.bodyA.id, pair.bodyB.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const contact = this.toContact(pair, preVelocities);
      if (contact) contacts.push(contact);
    }
    return contacts;
  }

  private toContact(
    pair: Matter.Pair,
    preVelocities: ReadonlyMap<number, Vec2>,
  ): PhysicsContact | null {
    const first = this.metaByBodyId.get(pair.bodyA.id);
    const second = this.metaByBodyId.get(pair.bodyB.id);
    if (!first || !second) return null;
    const [car, other] =
      first.kind === "car" || second.kind !== "car"
        ? [first, second]
        : [second, first];
    if (car.kind !== "car") return null;

    switch (other.kind) {
      case "car":
        return {
          kind: "car-car",
          aPid: car.pid,
          bPid: other.pid,
          billId: null,
          impulse: impulseOf(pair, preVelocities, gameConfig.carMass / 2),
          rammerPid: rammerOf(pair, preVelocities, first.pid, second.pid),
        };
      case "wall":
        return {
          kind: "car-wall",
          aPid: car.pid,
          bPid: null,
          billId: null,
          impulse: impulseOf(pair, preVelocities, gameConfig.carMass),
          rammerPid: null,
        };
      case "bill":
        return {
          kind: "car-bill",
          aPid: car.pid,
          bPid: null,
          billId: other.billId,
          impulse: 0,
          rammerPid: null,
        };
      case "base":
        return {
          kind: "car-base",
          aPid: car.pid,
          bPid: null,
          billId: null,
          impulse: 0,
          rammerPid: null,
        };
    }
  }
}

// Rammer = the car whose pre-step velocity has the larger component along the contact normal toward the
// other car. A fast car sliding past a parked car is therefore not credited as the rammer.
function rammerOf(
  pair: Matter.Pair,
  preVelocities: ReadonlyMap<number, Vec2>,
  aPid: number,
  bPid: number,
): number {
  const { x: nx, y: ny } = pair.collision.normal;
  const toward =
    (pair.bodyB.position.x - pair.bodyA.position.x) * nx +
    (pair.bodyB.position.y - pair.bodyA.position.y) * ny;
  const sign = toward < 0 ? -1 : 1;
  const preA = preVelocities.get(pair.bodyA.id) ?? ZERO;
  const preB = preVelocities.get(pair.bodyB.id) ?? ZERO;
  const approachA = sign * (preA.x * nx + preA.y * ny);
  const approachB = -sign * (preB.x * nx + preB.y * ny);
  return approachA >= approachB ? aPid : bPid;
}

// Matter pairs carry no impulse. Derived as mu * |change of relative normal velocity over the step|
// (kg * px/step). Walls are treated as infinite mass, so mu = carMass.
function impulseOf(
  pair: Matter.Pair,
  preVelocities: ReadonlyMap<number, Vec2>,
  reducedMass: number,
): number {
  const { x: nx, y: ny } = pair.collision.normal;
  const preA = preVelocities.get(pair.bodyA.id) ?? ZERO;
  const preB = preVelocities.get(pair.bodyB.id) ?? ZERO;
  const before = (preB.x - preA.x) * nx + (preB.y - preA.y) * ny;
  const after =
    (pair.bodyB.velocity.x - pair.bodyA.velocity.x) * nx +
    (pair.bodyB.velocity.y - pair.bodyA.velocity.y) * ny;
  return reducedMass * Math.abs(after - before);
}

function throttleAccel(
  throttle: number,
  forwardPxs: number,
  forwardCap: number,
): number {
  if (throttle > 0) {
    return forwardPxs < forwardCap ? throttle * gameConfig.acceleration : 0;
  }
  if (throttle < 0 && forwardPxs > 0) {
    return throttle * gameConfig.braking;
  }
  if (throttle < 0) {
    return forwardPxs > -gameConfig.maxReverseSpeed
      ? throttle * gameConfig.acceleration
      : 0;
  }
  return 0;
}

function carStateOf(pid: number, body: Matter.Body): CarBodyState {
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

// Wall normals point from the wall into the car. Velocity pointing into a wall is reflected with
// wallRestitution; tangential components are kept so the car slides along the wall.
function reflectOffWalls(velocity: Vec2, normals: readonly Vec2[]): Vec2 {
  let v = velocity;
  for (const n of normals) {
    const vn = dot(v, n);
    if (vn >= 0) continue;
    const k = (1 + gameConfig.wallRestitution) * vn;
    v = { x: v.x - k * n.x, y: v.y - k * n.y };
  }
  return v;
}

// Drops force components pushing into a wall so throttle slides the car along it instead of pinning it.
function removeIntoWalls(force: Vec2, normals: readonly Vec2[]): Vec2 {
  let f = force;
  for (const n of normals) {
    const fn = dot(f, n);
    if (fn >= 0) continue;
    f = { x: f.x - fn * n.x, y: f.y - fn * n.y };
  }
  return f;
}

function pushNormal(
  normals: Map<number, Vec2[]>,
  pid: number,
  normal: Vec2,
): void {
  const list = normals.get(pid);
  if (list) {
    list.push(normal);
  } else {
    normals.set(pid, [normal]);
  }
}

function negate(v: Vec2): Vec2 {
  return { x: -v.x, y: -v.y };
}

function headingOf(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}
