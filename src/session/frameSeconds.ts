const MAX_FRAME_SECONDS = 0.1;
const MS_PER_SECOND = 1000;

export function frameSecondsSince(
  lastMs: number | null,
  nowMs: number,
): number {
  if (lastMs === null) return 0;
  const seconds = (nowMs - lastMs) / MS_PER_SECOND;
  return Math.min(Math.max(seconds, 0), MAX_FRAME_SECONDS);
}
