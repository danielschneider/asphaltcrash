import { gameConfig } from "../../config/gameConfig";
import {
  clampInputFrame,
  NEUTRAL_INPUT,
  type InputFrame,
} from "../../game/input/InputFrame";

export const IDLE_HEARTBEAT_MS = 100;
const TIMING_EPSILON_MS = 1e-6;

export type InputSendFn = (frame: InputFrame) => void;

export class InputSender {
  private readonly send: InputSendFn;
  private readonly minIntervalMs = 1000 / gameConfig.inputHz;
  private latest: InputFrame = NEUTRAL_INPUT;
  private hasSample = false;
  private lastSent: InputFrame | undefined;
  private lastSentAtMs = 0;
  private seq = 0;

  constructor(send: InputSendFn) {
    this.send = send;
  }

  setLatest(aimX: number, aimY: number, action: boolean): void {
    this.seq += 1;
    this.latest = clampInputFrame({ aimX, aimY, action, seq: this.seq });
    this.hasSample = true;
  }

  tick(nowMs: number): void {
    if (!this.hasSample) {
      return;
    }
    if (this.lastSent === undefined || this.isActionEdge()) {
      this.emit(nowMs);
      return;
    }
    const elapsedMs = nowMs - this.lastSentAtMs;
    if (this.hasPending()) {
      if (elapsedMs + TIMING_EPSILON_MS >= this.minIntervalMs) {
        this.emit(nowMs);
      }
      return;
    }
    if (elapsedMs >= IDLE_HEARTBEAT_MS) {
      this.seq += 1;
      this.latest = { ...this.latest, seq: this.seq };
      this.emit(nowMs);
    }
  }

  private hasPending(): boolean {
    return this.latest.seq !== this.lastSent?.seq;
  }

  private isActionEdge(): boolean {
    return this.latest.action !== this.lastSent?.action;
  }

  private emit(nowMs: number): void {
    this.lastSent = this.latest;
    this.lastSentAtMs = nowMs;
    this.send(this.latest);
  }
}
