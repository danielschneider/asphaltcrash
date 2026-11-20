import { gameConfig } from "../../config/gameConfig";

export const MS_PER_SECOND = 1000;

export function ticksToMs(ticks: number): number {
  return (ticks * MS_PER_SECOND) / gameConfig.fixedStepHz;
}

export function msToTicks(ms: number): number {
  return (ms * gameConfig.fixedStepHz) / MS_PER_SECOND;
}

export function secondsToTicks(seconds: number): number {
  return seconds * gameConfig.fixedStepHz;
}

export function secondsToMs(seconds: number): number {
  return seconds * MS_PER_SECOND;
}
