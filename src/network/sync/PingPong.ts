import {
  PROTOCOL_VERSION,
  type PingMessage,
  type PongMessage,
} from "../protocol/messages";

export const RTT_SAMPLE_WINDOW = 5;

export class RttTracker {
  private readonly samples: number[] = [];

  addSample(rttMs: number): void {
    this.samples.push(rttMs);
    if (this.samples.length > RTT_SAMPLE_WINDOW) {
      this.samples.shift();
    }
  }

  median(): number | null {
    const count = this.samples.length;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = Math.floor(count / 2);
    const upper = sorted[mid];
    if (upper === undefined) {
      return null;
    }
    if (count % 2 === 1) {
      return upper;
    }
    const lower = sorted[mid - 1];
    return lower === undefined ? null : (lower + upper) / 2;
  }
}

export function makePing(nowMs: number): PingMessage {
  return { v: PROTOCOL_VERSION, t: "ping", c: nowMs };
}

export function makePong(ping: PingMessage, hostNowMs: number): PongMessage {
  return { v: PROTOCOL_VERSION, t: "pong", c: ping.c, h: hostNowMs };
}

export function measureRttMs(pong: PongMessage, nowMs: number): number {
  return nowMs - pong.c;
}

export function estimateHostOffsetMs(pong: PongMessage, nowMs: number): number {
  return pong.h - (pong.c + measureRttMs(pong, nowMs) / 2);
}
