import type { HudScore } from "../../store/hudStore";

const SECONDS_PER_MINUTE = 60;

function padTwo(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${padTwo(minutes)}:${padTwo(seconds)}`;
}

export function formatCash(amount: number): string {
  return `$${Math.trunc(amount)}`;
}

export function formatPlayerLabel(pid: number): string {
  return `P${pid + 1}`;
}

export function sortScoresDesc(scores: readonly HudScore[]): HudScore[] {
  return [...scores].sort((a, b) => b.score - a.score || a.pid - b.pid);
}
