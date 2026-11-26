import Matter from "matter-js";
import { gameConfig } from "../../config/gameConfig";
import { wallFrontImpact } from "../Rules";
import type { BodyMeta, PhysicsContact } from "./types";
import { dot, negate, pairKey, ZERO, type Vec2 } from "./vec";

type MetaLookup = (bodyId: number) => BodyMeta | undefined;
type PreVelocities = ReadonlyMap<number, Vec2>;

export function collectContacts(
  pairs: readonly Matter.Pair[],
  preVelocities: PreVelocities,
  metaOf: MetaLookup,
): PhysicsContact[] {
  const seen = new Set<string>();
  const contacts: PhysicsContact[] = [];
  for (const pair of pairs) {
    const key = pairKey(pair.bodyA.id, pair.bodyB.id);
    if (seen.has(key)) continue;
    seen.add(key);
    const contact = toContact(pair, preVelocities, metaOf);
    if (contact) contacts.push(contact);
  }
  return contacts;
}

export function toContact(
  pair: Matter.Pair,
  preVelocities: PreVelocities,
  metaOf: MetaLookup,
): PhysicsContact | null {
  const first = metaOf(pair.bodyA.id);
  const second = metaOf(pair.bodyB.id);
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
        frontImpact: null,
      };
    case "wall": {
      const carBody = first.kind === "car" ? pair.bodyA : pair.bodyB;
      const wallBody = first.kind === "wall" ? pair.bodyA : pair.bodyB;
      const wallNormal = wallToCarNormal(pair, wallBody, carBody);
      return {
        kind: "car-wall",
        aPid: car.pid,
        bPid: null,
        billId: null,
        impulse: impulseOf(pair, preVelocities, gameConfig.carMass),
        rammerPid: null,
        frontImpact: wallFrontImpact(carBody.angle, wallNormal),
      };
    }
    case "bill":
      return {
        kind: "car-bill",
        aPid: car.pid,
        bPid: null,
        billId: other.billId,
        impulse: 0,
        rammerPid: null,
        frontImpact: null,
      };
    case "base":
      return {
        kind: "car-base",
        aPid: car.pid,
        bPid: null,
        billId: null,
        impulse: 0,
        rammerPid: null,
        frontImpact: null,
      };
  }
}

export function collectWallNormals(
  pairs: readonly Matter.Pair[],
  metaOf: MetaLookup,
): Map<number, Vec2[]> {
  const normals = new Map<number, Vec2[]>();
  for (const pair of pairs) {
    const first = metaOf(pair.bodyA.id);
    const second = metaOf(pair.bodyB.id);
    if (!first || !second) continue;
    if (first.kind === "car" && second.kind === "wall") {
      pushNormal(
        normals,
        first.pid,
        wallToCarNormal(pair, pair.bodyB, pair.bodyA),
      );
    } else if (first.kind === "wall" && second.kind === "car") {
      pushNormal(
        normals,
        second.pid,
        wallToCarNormal(pair, pair.bodyA, pair.bodyB),
      );
    }
  }
  return normals;
}

// Matter splits car-car momentum between equal masses, so the victim alone is pushed too softly.
// The victim gains an extra kick along the centre line in proportion to the rammer's closing speed.
export function applyRamKicks(
  contacts: readonly PhysicsContact[],
  preVelocities: PreVelocities,
  bodyOf: (pid: number) => Matter.Body | undefined,
): void {
  for (const contact of contacts) {
    if (contact.kind !== "car-car" || contact.bPid === null) continue;
    if (contact.rammerPid === null) continue;
    const victimPid =
      contact.rammerPid === contact.aPid ? contact.bPid : contact.aPid;
    const rammer = bodyOf(contact.rammerPid);
    const victim = bodyOf(victimPid);
    if (!rammer || !victim) continue;
    const centre = {
      x: victim.position.x - rammer.position.x,
      y: victim.position.y - rammer.position.y,
    };
    const distance = Math.hypot(centre.x, centre.y);
    if (distance === 0) continue;
    const n = { x: centre.x / distance, y: centre.y / distance };
    const preRammer = preVelocities.get(rammer.id) ?? ZERO;
    const preVictim = preVelocities.get(victim.id) ?? ZERO;
    const closing = dot(
      { x: preRammer.x - preVictim.x, y: preRammer.y - preVictim.y },
      n,
    );
    if (closing <= 0) continue;
    const kick = gameConfig.ramKickFactor * closing;
    Matter.Body.setVelocity(victim, {
      x: victim.velocity.x + n.x * kick,
      y: victim.velocity.y + n.y * kick,
    });
  }
}

// Rammer = the car whose pre-step velocity has the larger component along the contact normal toward the
// other car. A fast car sliding past a parked car is therefore not credited as the rammer.
function rammerOf(
  pair: Matter.Pair,
  preVelocities: PreVelocities,
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
  preVelocities: PreVelocities,
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

// Matter does not fix pair body order, so the normal is oriented from the wall centre toward the car centre.
function wallToCarNormal(
  pair: Matter.Pair,
  wall: Matter.Body,
  car: Matter.Body,
): Vec2 {
  const n = pair.collision.normal;
  const toCar =
    (car.position.x - wall.position.x) * n.x +
    (car.position.y - wall.position.y) * n.y;
  return toCar >= 0 ? { x: n.x, y: n.y } : negate(n);
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
