import { formatTime } from "./formatters";

interface TimerBadgeProps {
  readonly remainingMs: number;
}

export function TimerBadge({ remainingMs }: TimerBadgeProps) {
  return (
    <div className="timer-badge" role="timer" aria-label="Time remaining">
      {formatTime(remainingMs)}
    </div>
  );
}
