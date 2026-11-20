import { gameConfig, type SpawnPoint } from "../config/gameConfig";
import type { ArenaView, BaseView } from "../types/game";

const SPAWN_POOL: readonly SpawnPoint[] = [
  ...gameConfig.humanSpawns,
  ...gameConfig.botSpawns,
];

export function spawnFor(pid: number): SpawnPoint {
  const spawn = SPAWN_POOL[pid];
  if (spawn === undefined) {
    throw new Error(`arena: no spawn for player ${pid}`);
  }
  return spawn;
}

export function buildArenaView(
  humanPlayerIds: readonly number[],
  botPlayerIds: readonly number[],
): ArenaView {
  const bases: BaseView[] = [];
  for (const pid of [...humanPlayerIds, ...botPlayerIds]) {
    const spawn = spawnFor(pid);
    bases.push({
      pid,
      x: spawn.x,
      y: spawn.y,
      width: gameConfig.baseWidth,
      height: gameConfig.baseHeight,
    });
  }
  return {
    width: gameConfig.arenaWidth,
    height: gameConfig.arenaHeight,
    wallThickness: gameConfig.wallThickness,
    bases,
  };
}
