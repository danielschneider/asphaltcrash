import {
  PROTOCOL_VERSION,
  type PingMessage,
  type PongMessage,
} from "../protocol/messages";
import type { ConnectivityQuality } from "../../store/hudStore";

export const RTT_SAMPLE_WINDOW = 5;
export const CONNECTIVITY_GOOD_RTT_MS = 100;
export const CONNECTIVITY_GOOD_JITTER_MS = 25;
export const CONNECTIVITY_FAIR_RTT_MS = 180;
export const CONNECTIVITY_FAIR_JITTER_MS = 50;

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

export class JitterTracker {
  private readonly diffs: number[] = [];
  private lastRttMs: number | null = null;

  addSample(rttMs: number): void {
    if (this.lastRttMs !== null) {
      this.diffs.push(Math.abs(rttMs - this.lastRttMs));
      if (this.diffs.length > RTT_SAMPLE_WINDOW) this.diffs.shift();
    }
    this.lastRttMs = rttMs;
  }

  average(): number {
    if (this.diffs.length === 0) return 0;
    return (
      this.diffs.reduce((total, diff) => total + diff, 0) / this.diffs.length
    );
  }
}

export function classifyConnectivity(
  rttMs: number | null,
  jitterMs: number,
): ConnectivityQuality {
  if (rttMs === null) return "poor";
  if (
    rttMs <= CONNECTIVITY_GOOD_RTT_MS &&
    jitterMs <= CONNECTIVITY_GOOD_JITTER_MS
  ) {
    return "good";
  }
  if (
    rttMs <= CONNECTIVITY_FAIR_RTT_MS &&
    jitterMs <= CONNECTIVITY_FAIR_JITTER_MS
  ) {
    return "fair";
  }
  return "poor";
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
