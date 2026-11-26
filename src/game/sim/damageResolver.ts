import { gameConfig } from "../../config/gameConfig";
import type { PhysicsContact } from "../Physics";
import {
  applyDamage,
  humanDamageTakenMultiplier,
  isContactOnCooldown,
  wallDamageMultiplier,
} from "../Rules";
import { recordHit, isInvulnerable } from "./CarState";
import { DAMAGE_CONFIG } from "./matchConstants";
import { carOf, type SimState } from "./simState";
import type { SimEvent } from "../../types/game";

export function resolveDamage(
  state: SimState,
  contacts: readonly PhysicsContact[],
  tick: number,
  events: SimEvent[],
): void {
  for (const contact of contacts) {
    if (contact.kind === "car-wall") {
      damageFromWall(
        state,
        contact.aPid,
        contact.impulse,
        contact.frontImpact ?? 0,
        tick,
      );
      continue;
    }
    if (
      contact.kind === "car-car" &&
      contact.bPid !== null &&
      contact.rammerPid !== null
    ) {
      damageFromCarCar(
        state,
        contact.aPid,
        contact.bPid,
        contact.impulse,
        contact.rammerPid,
        tick,
        events,
      );
    }
  }
}

function wallKey(pid: number): string {
  return `${pid}:wall`;
}

function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

function damageFromWall(
  state: SimState,
  pid: number,
  impulse: number,
  frontImpact: number,
  tick: number,
): void {
  const key = wallKey(pid);
  if (isContactOnCooldown(state.contactTicks.get(key), tick)) return;
  const damage =
    applyDamage(impulse, DAMAGE_CONFIG) * wallDamageMultiplier(frontImpact);
  if (damage <= 0) return;
  state.contactTicks.set(key, tick);
  applyHit(state, pid, null, damage, impulse, tick);
}

function damageFromCarCar(
  state: SimState,
  aPid: number,
  bPid: number,
  impulse: number,
  rammerPid: number,
  tick: number,
  events: SimEvent[],
): void {
  if (carOf(state, aPid).destroyed || carOf(state, bPid).destroyed) return;
  const key = pairKey(aPid, bPid);
  if (isContactOnCooldown(state.contactTicks.get(key), tick)) return;
  const damage = applyDamage(impulse, DAMAGE_CONFIG);
  if (damage <= 0) return;
  state.contactTicks.set(key, tick);
  const attackerPid = rammerPid;
  const victimPid = attackerPid === aPid ? bPid : aPid;
  if (impulse >= gameConfig.hitEventThreshold) {
    events.push({ k: "hit", attackerPid, victimPid, impulse });
  }
  applyHit(state, victimPid, attackerPid, damage, impulse, tick);
  const rammerShare = damage * gameConfig.rammerDamageShare;
  applyHit(state, rammerPid, victimPid, rammerShare, impulse, tick);
}

function applyHit(
  state: SimState,
  victimPid: number,
  attackerPid: number | null,
  damage: number,
  impulse: number,
  tick: number,
): void {
  const car = carOf(state, victimPid);
  if (car.destroyed || isInvulnerable(car, tick)) return;
  const isHuman = state.humanIds.has(victimPid);
  const scaled =
    damage * humanDamageTakenMultiplier(state.setup.botDifficulty, isHuman);
  car.hp = Math.max(0, car.hp - scaled);
  if (attackerPid !== null) {
    recordHit(car, { attackerPid, tick, impulse }, tick);
  }
}
