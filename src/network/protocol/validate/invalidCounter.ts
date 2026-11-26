import type { PeerId } from "../../../types/network";

export interface InvalidCounter {
  record(peerId: PeerId, nowMs: number): void;
  count(peerId: PeerId): number;
  shouldDisconnect(peerId: PeerId, nowMs: number): boolean;
}

export const INVALID_WINDOW_MS = 5000;
export const INVALID_DISCONNECT_COUNT = 3;

export function createInvalidCounter(): InvalidCounter {
  const totals = new Map<PeerId, number>();
  const recent = new Map<PeerId, number[]>();

  return {
    record(peerId, nowMs) {
      totals.set(peerId, (totals.get(peerId) ?? 0) + 1);
      const times = recent.get(peerId) ?? [];
      times.push(nowMs);
      if (times.length > INVALID_DISCONNECT_COUNT) {
        times.shift();
      }
      recent.set(peerId, times);
    },
    count(peerId) {
      return totals.get(peerId) ?? 0;
    },
    shouldDisconnect(peerId, nowMs) {
      const times = recent.get(peerId);
      if (times === undefined || times.length < INVALID_DISCONNECT_COUNT) {
        return false;
      }
      const oldest = times[times.length - INVALID_DISCONNECT_COUNT];
      return oldest !== undefined && nowMs - oldest <= INVALID_WINDOW_MS;
    },
  };
}
