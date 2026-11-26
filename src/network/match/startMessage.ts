import { spawnFor } from "../../config/spawnPoints";
import type { MatchSetup } from "../../types/game";
import {
  PROTOCOL_VERSION,
  type NameItem,
  type ReadyMessage,
  type SpawnItem,
  type StartMessage,
} from "../protocol/messages";
import {
  validateStart,
  type ParsedStart,
  type ParseResult,
} from "../protocol/validate";

export type { ParsedStart };

function spawnItemsFor(setup: MatchSetup): SpawnItem[] {
  const pids = [...setup.humanPlayerIds, ...setup.botPlayerIds];
  return [...pids]
    .sort((a, b) => a - b)
    .map((pid): SpawnItem => {
      const spawn = spawnFor(pid, setup.gameMode);
      return [pid, spawn.x, spawn.y, spawn.angle];
    });
}

export function buildStart(
  setup: MatchSetup,
  matchId: number,
  names: ReadonlyMap<number, string> = new Map(),
): StartMessage {
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
    names: [...names.entries()].map(([pid, name]): NameItem => [pid, name]),
  };
}

export function parseStart(raw: unknown): ParseResult<ParsedStart> {
  return validateStart(raw);
}

export function makeReady(matchId: number): ReadyMessage {
  return { v: PROTOCOL_VERSION, t: "ready", mid: matchId };
}
