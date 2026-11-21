import type { GameMode } from "../types/game";

export interface HudScore {
  readonly pid: number;
  readonly score: number;
}

export interface HudSnapshot {
  readonly remainingMs: number;
  readonly gameMode: GameMode;
  readonly winnerPids: readonly number[] | null;
  readonly score: number;
  readonly cargo: number;
  readonly hp: number;
  readonly scores: readonly HudScore[];
  readonly feed: readonly string[];
  readonly paused: boolean;
}

export interface HudSink {
  push(snapshot: HudSnapshot): void;
}

export interface HudStore extends HudSink {
  subscribe(listener: () => void): () => void;
  getSnapshot(): HudSnapshot;
}

const EMPTY_HUD: HudSnapshot = {
  remainingMs: 0,
  gameMode: "cash",
  winnerPids: null,
  score: 0,
  cargo: 0,
  hp: 0,
  scores: [],
  feed: [],
  paused: false,
};

export function createHudStore(): HudStore {
  let snapshot = EMPTY_HUD;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): HudSnapshot {
      return snapshot;
    },
    push(next: HudSnapshot): void {
      snapshot = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

export const hudStore = createHudStore();
