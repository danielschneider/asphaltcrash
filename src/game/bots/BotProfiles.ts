import { gameConfig } from "../../config/gameConfig";
import type { BotDifficulty } from "../../types/game";

export const BOT_STATES = [
  "SeekBill",
  "DeliverCash",
  "Attack",
  "Evade",
  "Recover",
] as const;

export type BotState = (typeof BOT_STATES)[number];

export interface BotProfile {
  readonly reactionDelayTicks: number;
  readonly aimNoiseRad: number;
  readonly aggression: number;
  readonly flankFactor: number;
}

export function profileFor(difficulty: BotDifficulty): BotProfile {
  return gameConfig.botProfiles[difficulty];
}
