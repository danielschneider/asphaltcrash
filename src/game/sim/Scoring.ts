import { gameConfig } from "../../config/gameConfig";
import { secondsToMs, ticksToMs } from "./time";

export function scoreDelivery(
  scores: Map<number, number>,
  pid: number,
  amount: number,
): void {
  if (!Number.isFinite(amount)) return;
  const whole = Math.trunc(amount);
  scores.set(pid, (scores.get(pid) ?? 0) + whole);
}

export function scoreKill(
  scores: Map<number, number>,
  attackerPid: number,
  points: number = gameConfig.killBonus,
): void {
  scoreDelivery(scores, attackerPid, points);
}

export function timerRemainingMs(tick: number, matchSeconds: number): number {
  return Math.max(0, secondsToMs(matchSeconds) - Math.round(ticksToMs(tick)));
}

export function timerEventsCrossed(
  prevRemainingMs: number,
  nowRemainingMs: number,
): number[] {
  return gameConfig.timerWarningSeconds.filter(
    (seconds) =>
      prevRemainingMs > secondsToMs(seconds) &&
      secondsToMs(seconds) >= nowRemainingMs,
  );
}
