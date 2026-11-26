import { gameConfig } from "../../config/gameConfig";
import { spawnFor } from "../../config/spawnPoints";
import type { SimEvent } from "../../types/game";
import { attributeKill, nextSpawnTick } from "../Rules";
import { scoreKill } from "./Scoring";
import { dropCargo } from "./billFlow";
import { INVULNERABLE_TICKS } from "./matchConstants";
import { carOf, type SimState } from "./simState";
import type { CarState } from "./CarState";

export function resolveDestruction(
  state: SimState,
  tick: number,
  events: SimEvent[],
): void {
  for (const pid of state.pids) {
    const car = carOf(state, pid);
    if (car.destroyed || car.hp > 0) continue;
    destroyCar(state, car, tick, events);
  }
}

export function resolveRespawns(
  state: SimState,
  tick: number,
  events: SimEvent[],
): void {
  if (state.setup.gameMode === "crashfest") return;
  for (const pid of state.pids) {
    const car = carOf(state, pid);
    if (!car.destroyed || tick < car.respawnTick) continue;
    respawnCar(state, car, tick, events);
  }
}

function destroyCar(
  state: SimState,
  car: CarState,
  tick: number,
  events: SimEvent[],
): void {
  const { pid } = car;
  car.destroyed = true;
  car.respawnTick =
    state.setup.gameMode === "crashfest" ? 0 : nextSpawnTick(tick);
  car.boostTicksLeft = 0;
  car.boosting = false;
  car.throttle = 0;
  state.physics.setCarWrecked(pid, true);

  const dropped = [...car.carried];
  car.carried = [];
  dropCargo(state, pid, dropped, events);

  const attackerPid = attributeKill(car.hits, pid, tick);
  car.hits = [];
  if (attackerPid === null) return;
  scoreKill(
    state.scores,
    attackerPid,
    state.setup.gameMode === "crashfest" ? 1 : undefined,
  );
  events.push({ k: "kill", attackerPid, victimPid: pid });
}

function respawnCar(
  state: SimState,
  car: CarState,
  tick: number,
  events: SimEvent[],
): void {
  const { pid } = car;
  const spawn = spawnFor(pid, state.setup.gameMode);
  state.physics.teleportCar(pid, spawn.x, spawn.y, spawn.angle);
  state.physics.setCarWrecked(pid, false);
  car.destroyed = false;
  car.hp = gameConfig.maxHealth;
  car.carried = [];
  car.invulnerableUntilTick = tick + INVULNERABLE_TICKS;
  events.push({
    k: "respawn",
    pid,
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
  });
}
