import { NEUTRAL_INPUT, clampInputFrame, type InputFrame } from "./InputFrame";

export interface InputWrite {
  readonly throttle?: number;
  readonly steer?: number;
  readonly action?: boolean;
}

export class InputBuffer {
  private frame: InputFrame = NEUTRAL_INPUT;

  write(partial: InputWrite): void {
    const next = clampInputFrame({
      throttle: partial.throttle ?? this.frame.throttle,
      steer: partial.steer ?? this.frame.steer,
      action: partial.action ?? this.frame.action,
      seq: this.frame.seq,
    });
    const isChanged =
      next.throttle !== this.frame.throttle ||
      next.steer !== this.frame.steer ||
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
