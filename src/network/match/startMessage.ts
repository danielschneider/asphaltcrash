import { spawnFor } from "../../config/spawnPoints";
import type { MatchSetup } from "../../types/game";
import {
  PROTOCOL_VERSION,
  type ReadyMessage,
  type SpawnItem,
  type StartMessage,
} from "../protocol/messages";
import { validateStart, type ParseResult } from "../protocol/validate";

function spawnItemsFor(setup: MatchSetup): SpawnItem[] {
  const pids = [...setup.humanPlayerIds, ...setup.botPlayerIds];
  return [...pids]
    .sort((a, b) => a - b)
    .map((pid): SpawnItem => {
      const spawn = spawnFor(pid, setup.gameMode);
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
      gameMode: setup.gameMode,
    },
    spawns: spawnItemsFor(setup),
  };
}

export function parseStart(raw: unknown): ParseResult<StartMessage> {
  return validateStart(raw);
}

export function makeReady(matchId: number): ReadyMessage {
  return { v: PROTOCOL_VERSION, t: "ready", mid: matchId };
}
