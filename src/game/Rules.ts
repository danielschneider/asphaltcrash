import { gameConfig } from "../config/gameConfig";
import { msToTicks, secondsToTicks } from "./sim/time";

export interface DamageConfig {
  readonly damageThresholdImpulse: number;
  readonly damageFactor: number;
  readonly maxDamagePerHit: number;
}

export interface AttributableHit {
  readonly attackerPid: number;
  readonly tick: number;
  readonly impulse: number;
}

export function ticksFromMs(ms: number): number {
  return Math.ceil(msToTicks(ms));
}

export function applyDamage(impulse: number, config: DamageConfig): number {
  if (!Number.isFinite(impulse) || impulse < 0) {
    return 0;
  }
  const raw = (impulse - config.damageThresholdImpulse) * config.damageFactor;
  return Math.min(Math.max(raw, 0), config.maxDamagePerHit);
}

export function isContactOnCooldown(
  lastContactTick: number | undefined,
  nowTick: number,
): boolean {
  return (
    lastContactTick !== undefined &&
    nowTick - lastContactTick < ticksFromMs(gameConfig.contactCooldownMs)
  );
}

export function isWithinAttribution(
  lastHitTick: number | undefined,
  nowTick: number,
): boolean {
  return (
    lastHitTick !== undefined &&
    nowTick - lastHitTick < secondsToTicks(gameConfig.attributionWindowSeconds)
  );
}

export function canDeliver(
  carPid: number,
  cargo: number,
  baseOwnerPid: number,
): boolean {
  return carPid === baseOwnerPid && cargo > 0;
}

export function canPickUp(cargo: number): boolean {
  return cargo < gameConfig.cargoCapacity;
}

export function nextSpawnTick(nowTick: number): number {
  return nowTick + secondsToTicks(gameConfig.respawnSeconds);
}

export function attributeKill(
  hits: readonly AttributableHit[],
  victimPid: number,
  nowTick: number,
): number | null {
  let bestPid: number | null = null;
  let bestImpulse = -Infinity;
  for (const hit of hits) {
    if (hit.attackerPid === victimPid) continue;
    if (!isWithinAttribution(hit.tick, nowTick)) continue;
    if (hit.impulse > bestImpulse) {
      bestImpulse = hit.impulse;
      bestPid = hit.attackerPid;
    }
  }
  return bestPid;
}
