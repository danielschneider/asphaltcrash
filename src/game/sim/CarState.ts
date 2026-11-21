import { CAR_FLAG, type BillValue, type GameMode } from "../../types/game";
import { isWithinAttribution, type AttributableHit } from "../Rules";

export interface CarState {
  readonly pid: number;
  hp: number;
  destroyed: boolean;
  respawnTick: number;
  invulnerableUntilTick: number;
  carried: BillValue[];
  hits: AttributableHit[];
  boostTicksLeft: number;
  boostCooldownTicks: number;
  throttle: number;
  boosting: boolean;
}

export function createCarState(pid: number, maxHealth: number): CarState {
  return {
    pid,
    hp: maxHealth,
    destroyed: false,
    respawnTick: 0,
    invulnerableUntilTick: 0,
    carried: [],
    hits: [],
    boostTicksLeft: 0,
    boostCooldownTicks: 0,
    throttle: 0,
    boosting: false,
  };
}

export function recordHit(
  car: CarState,
  hit: AttributableHit,
  nowTick: number,
): void {
  car.hits = car.hits.filter((entry) =>
    isWithinAttribution(entry.tick, nowTick),
  );
  car.hits.push(hit);
}

export function isInvulnerable(car: CarState, tick: number): boolean {
  return tick < car.invulnerableUntilTick;
}

export function carFlags(car: CarState, gameMode: GameMode = "cash"): number {
  let flags = 0;
  if (car.destroyed) {
    flags |= CAR_FLAG.destroyed;
    if (gameMode === "cash") flags |= CAR_FLAG.respawning;
  }
  if (car.boosting) {
    flags |= CAR_FLAG.boosting;
  }
  if (car.throttle < 0) {
    flags |= CAR_FLAG.braking;
  }
  if (car.carried.length > 0) {
    flags |= CAR_FLAG.carrying;
  }
  return flags;
}
