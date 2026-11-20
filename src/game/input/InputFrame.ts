export interface InputFrame {
  readonly throttle: number;
  readonly steer: number;
  readonly action: boolean;
  readonly seq: number;
}

export const NEUTRAL_INPUT: InputFrame = {
  throttle: 0,
  steer: 0,
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

export function clampInputFrame(raw: InputFrame): InputFrame {
  return {
    throttle: clampUnit(raw.throttle),
    steer: clampUnit(raw.steer),
    action: raw.action,
    seq: clampSeq(raw.seq),
  };
}
