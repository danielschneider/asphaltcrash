export function damageFromHealth(hp: number, maxHealth: number): number {
  const ratio = hp / maxHealth;
  if (!Number.isFinite(ratio)) return 0;
  return clamp01(1 - ratio);
}

export function smoothDamage(
  current: number,
  target: number,
  dtSeconds: number,
  rate: number,
): number {
  const from = clamp01(current);
  const to = clamp01(target);
  if (dtSeconds <= 0 || rate <= 0) return from;
  const blend = 1 - Math.exp(-rate * dtSeconds);
  return clamp01(from + (to - from) * blend);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
