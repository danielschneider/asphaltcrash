import { NEUTRAL_INPUT, clampInputFrame, type InputFrame } from "./InputFrame";

export interface InputWrite {
  readonly aimX?: number;
  readonly aimY?: number;
  readonly action?: boolean;
}

export class InputBuffer {
  private frame: InputFrame = NEUTRAL_INPUT;

  write(partial: InputWrite): void {
    const next = clampInputFrame({
      aimX: partial.aimX ?? this.frame.aimX,
      aimY: partial.aimY ?? this.frame.aimY,
      action: partial.action ?? this.frame.action,
      seq: this.frame.seq,
    });
    const isChanged =
      next.aimX !== this.frame.aimX ||
      next.aimY !== this.frame.aimY ||
      next.action !== this.frame.action;
    if (!isChanged) {
      return;
    }
    this.frame = { ...next, seq: this.frame.seq + 1 };
  }

  latest(): InputFrame {
    return this.frame;
  }
}
