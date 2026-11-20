import { gameConfig } from "../config/gameConfig";

export const MIN_LOBBY_BOTS = 0;
export const MAX_LOBBY_BOTS = gameConfig.maxCars - gameConfig.maxHumans;
export const MIN_MATCH_CARS = 2;

export interface RosterHuman {
  readonly pid: number;
  readonly name: string;
}

export interface RosterRow {
  readonly key: string;
  readonly label: string;
}

export function clampBotCount(value: number): number {
  if (Number.isNaN(value)) return MIN_LOBBY_BOTS;
  return Math.min(MAX_LOBBY_BOTS, Math.max(MIN_LOBBY_BOTS, Math.round(value)));
}

export function rosterWithBots(
  humans: readonly RosterHuman[],
  bots: number,
): readonly RosterRow[] {
  const humanRows = humans.map((human): RosterRow => ({
    key: `human-${human.pid}`,
    label: `${human.pid}: ${human.name}`,
  }));
  const cpuRows = Array.from(
    { length: clampBotCount(bots) },
    (_, index): RosterRow => ({
      key: `cpu-${index + 1}`,
      label: `CPU ${index + 1}`,
    }),
  );
  return [...humanRows, ...cpuRows];
}

export function totalCarCount(humanCount: number, bots: number): number {
  return humanCount + clampBotCount(bots);
}
