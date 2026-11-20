import { gameConfig } from "../../config/gameConfig";
import type { MatchSetup } from "../../types/game";
import {
  PROTOCOL_VERSION,
  type ReadyMessage,
  type SpawnItem,
  type StartMessage,
} from "../protocol/messages";
import { validateStart, type ParseResult } from "../protocol/validate";

const SPAWN_POOL = [...gameConfig.humanSpawns, ...gameConfig.botSpawns];

function spawnItemsFor(pids: readonly number[]): SpawnItem[] {
  return [...pids]
    .sort((a, b) => a - b)
    .map((pid): SpawnItem => {
      const spawn = SPAWN_POOL[pid];
      if (spawn === undefined) {
        throw new Error(`startMessage: no spawn for player ${pid}`);
      }
      return [pid, spawn.x, spawn.y, spawn.angle];
    });
}

export function buildStart(setup: MatchSetup, matchId: number): StartMessage {
  return {
    v: PROTOCOL_VERSION,
    t: "start",
    mid: matchId,
    seed: setup.seed,
    cfg: {
      matchSeconds: setup.matchSeconds,
      botDifficulty: setup.botDifficulty,
      humanCount: setup.humanPlayerIds.length,
    },
    spawns: spawnItemsFor([...setup.humanPlayerIds, ...setup.botPlayerIds]),
  };
}

export function parseStart(raw: unknown): ParseResult<StartMessage> {
  return validateStart(raw);
}

export function makeReady(matchId: number): ReadyMessage {
  return { v: PROTOCOL_VERSION, t: "ready", mid: matchId };
}
