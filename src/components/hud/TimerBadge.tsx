import { formatTime } from "./formatters";
import type { GameMode } from "../../types/game";

interface TimerBadgeProps {
  readonly remainingMs: number;
  readonly gameMode: GameMode;
}

export function TimerBadge({ remainingMs, gameMode }: TimerBadgeProps) {
  if (gameMode === "crashfest") {
    return (
      <div className="timer-badge" role="status" aria-label="Last car wins">
        Last car wins
      </div>
    );
  }
  return (
    <div className="timer-badge" role="timer" aria-label="Time remaining">
      {formatTime(remainingMs)}
    </div>
  );
}
