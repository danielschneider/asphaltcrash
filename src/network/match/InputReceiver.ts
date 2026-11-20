import { gameConfig } from "../../config/gameConfig";
import {
  clampInputFrame,
  NEUTRAL_INPUT,
  type InputFrame,
} from "../../game/input/InputFrame";
import type { InputMessage } from "../protocol/messages";

export type InputWire = Pick<InputMessage, "s" | "ax" | "ay" | "a">;

interface InputEntry {
  readonly frame: InputFrame;
  readonly receivedAtMs: number;
}

const WIRE_TO_UNIT = 100;

export class InputReceiver {
  private readonly entries = new Map<number, InputEntry>();

  accept(pid: number, msg: InputWire, nowMs: number): boolean {
    const last = this.entries.get(pid);
    if (last !== undefined && msg.s <= last.frame.seq) {
      return false;
    }
    const frame = clampInputFrame({
      aimX: msg.ax / WIRE_TO_UNIT,
      aimY: msg.ay / WIRE_TO_UNIT,
      action: msg.a === 1,
      seq: msg.s,
    });
    this.entries.set(pid, { frame, receivedAtMs: nowMs });
    return true;
  }

  latest(pid: number, nowMs: number): InputFrame {
    const entry = this.entries.get(pid);
    if (
      entry === undefined ||
      nowMs - entry.receivedAtMs >= gameConfig.inputTimeoutMs
    ) {
      return NEUTRAL_INPUT;
    }
    return entry.frame;
  }

  lastSeq(pid: number): number {
    return this.entries.get(pid)?.frame.seq ?? 0;
  }

  dropPid(pid: number): void {
    this.entries.delete(pid);
  }
}
