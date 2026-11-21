import { gameConfig, type SpawnPoint } from "./gameConfig";
import type { GameMode } from "../types/game";

const SPAWN_POOL: readonly SpawnPoint[] = [
  ...gameConfig.humanSpawns,
  ...gameConfig.botSpawns,
];

export function spawnFor(pid: number, gameMode: GameMode = "cash"): SpawnPoint {
  const source = SPAWN_POOL[pid];
  if (source === undefined) {
    throw new Error(`spawnPoints: no spawn for player ${pid}`);
  }
  if (gameMode === "cash") return source;
  return {
    x: source.x * (gameConfig.crashfestArenaWidth / gameConfig.arenaWidth),
    y: source.y * (gameConfig.crashfestArenaHeight / gameConfig.arenaHeight),
    angle: source.angle,
  };
}
