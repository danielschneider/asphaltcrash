export interface InputFrame {
  readonly aimX: number;
  readonly aimY: number;
  readonly action: boolean;
  readonly seq: number;
}

export const NEUTRAL_INPUT: InputFrame = {
  aimX: 0,
  aimY: 0,
  action: false,
  seq: 0,
};

function clampUnit(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(-1, value));
}

function clampSeq(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

// Aim is a direction in screen space (+y down) with magnitude <= 1. Diagonals outside the unit circle are scaled back onto it.
function clampAim(
  aimX: number,
  aimY: number,
): { readonly aimX: number; readonly aimY: number } {
  const x = clampUnit(aimX);
  const y = clampUnit(aimY);
  const length = Math.hypot(x, y);
  if (length <= 1) {
    return { aimX: x, aimY: y };
  }
  return { aimX: x / length, aimY: y / length };
}

export function clampInputFrame(raw: InputFrame): InputFrame {
  return {
    ...clampAim(raw.aimX, raw.aimY),
    action: raw.action,
    seq: clampSeq(raw.seq),
  };
}
