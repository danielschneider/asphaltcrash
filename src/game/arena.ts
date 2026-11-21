import { gameConfig } from "../config/gameConfig";
import { spawnFor } from "../config/spawnPoints";
import type { ArenaView, BaseView, GameMode } from "../types/game";

export function buildArenaView(
  humanPlayerIds: readonly number[],
  botPlayerIds: readonly number[],
  gameMode: GameMode = "cash",
): ArenaView {
  const bases: BaseView[] = [];
  if (gameMode === "cash") {
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
  }
  return {
    width:
      gameMode === "crashfest"
        ? gameConfig.crashfestArenaWidth
        : gameConfig.arenaWidth,
    height:
      gameMode === "crashfest"
        ? gameConfig.crashfestArenaHeight
        : gameConfig.arenaHeight,
    wallThickness: gameConfig.wallThickness,
    bases,
  };
}
