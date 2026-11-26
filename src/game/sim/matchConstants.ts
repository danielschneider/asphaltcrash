import { gameConfig } from "../../config/gameConfig";
import { ticksFromMs, type DamageConfig } from "../Rules";
import { secondsToMs } from "./time";

export const MAX_PID = gameConfig.maxCars - 1;
export const BOOST_TICKS = ticksFromMs(secondsToMs(gameConfig.boostSeconds));
export const BOOST_COOLDOWN_TICKS = ticksFromMs(
  secondsToMs(gameConfig.boostCooldownSeconds),
);
export const INVULNERABLE_TICKS = ticksFromMs(
  secondsToMs(gameConfig.invulnerableAfterRespawnSeconds),
);
export const DAMAGE_CONFIG: DamageConfig = {
  damageThresholdImpulse: gameConfig.damageThresholdImpulse,
  damageFactor: gameConfig.damageFactor,
  maxDamagePerHit: gameConfig.maxDamagePerHit,
};
