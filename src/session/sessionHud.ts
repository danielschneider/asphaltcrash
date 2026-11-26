import type { ScoreItem } from "../network/protocol/messages";
import type { HudSnapshot } from "../store/hudStore";
import type { LobbyPlayer } from "../store/lobbyStore";
import type { GameMode, MatchSetup, MatchSnapshot } from "../types/game";
import { LOCAL_PLAYER_ID, type SoloMatchOptions } from "./sessionDeps";

export function buildCarNames(
  humans: readonly Pick<LobbyPlayer, "pid" | "name">[],
  botCount: number,
): ReadonlyMap<number, string> {
  const names = new Map<number, string>();
  for (const human of humans) names.set(human.pid, human.name);
  const firstBotPid = humans.length;
  for (let index = 0; index < botCount; index += 1) {
    names.set(firstBotPid + index, `CPU ${index + 1}`);
  }
  return names;
}

export function buildSoloSetup(options: SoloMatchOptions): MatchSetup {
  const botPlayerIds = Array.from(
    { length: options.botCount },
    (_, index) => index + 1,
  );
  return {
    gameMode: options.gameMode,
    seed: options.seed,
    humanPlayerIds: [LOCAL_PLAYER_ID],
    botPlayerIds,
    botDifficulty: options.botDifficulty,
    matchSeconds: options.matchSeconds,
  };
}

// Tuple layout: [pid, cash, kills, score]; crashfest ranks by kills, cash by cash.
export function scoresFromSnapshot(
  cars: MatchSnapshot["cars"],
  gameMode: GameMode,
): ScoreItem[] {
  return cars.map((car): ScoreItem =>
    gameMode === "crashfest"
      ? [car.pid, 0, car.score, 0]
      : [car.pid, car.score, 0, car.score],
  );
}

export function buildEndHud(
  scores: readonly ScoreItem[],
  localPid: number,
  gameMode: GameMode,
  winnerPids: readonly number[],
  names: ReadonlyMap<number, string>,
): HudSnapshot {
  const local = scores.find((row) => row[0] === localPid);
  const localScore =
    gameMode === "crashfest" ? (local?.[2] ?? 0) : (local?.[1] ?? 0);
  return {
    remainingMs: 0,
    gameMode,
    winnerPids,
    localPid,
    names,
    score: localScore,
    cargo: 0,
    hp: 0,
    scores: scores.map(([pid, cash, kills]) => ({
      pid,
      score: gameMode === "crashfest" ? kills : cash,
    })),
    feed: [],
    paused: false,
  };
}
