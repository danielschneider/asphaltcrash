import { CarAudio } from "../game/audio/CarAudio";
import { createWorldRenderer, type WorldRenderer } from "../game/Renderer";
import { createPeerJsFactory } from "../network/transport/peerJsFactory";
import type { PeerFactory } from "../network/transport/PeerTransport";
import { defaultRandomBytes, type RandomBytes } from "../network/room/roomCode";
import { hudStore, type HudStore } from "../store/hudStore";
import type { ArenaView, BotDifficulty, GameMode } from "../types/game";

export const LOCAL_PLAYER_ID = 0;

export interface SoloMatchOptions {
  readonly botCount: number;
  readonly botDifficulty: BotDifficulty;
  readonly gameMode: GameMode;
  readonly matchSeconds: number;
  readonly seed: number;
}

export interface LobbyTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface LobbyDeps {
  readonly peerFactory: PeerFactory;
  readonly timers: LobbyTimers;
  readonly randomBytes: RandomBytes;
}

export interface FrameScheduler {
  request(cb: (t: number) => void): number;
  cancel(id: number): void;
}

export interface SessionClock {
  now(): number;
  randomSeed(): number;
  newMatchId(): number;
}

export interface SessionDeps {
  readonly createRenderer: (
    host: HTMLElement,
    arena: ArenaView,
  ) => Promise<WorldRenderer>;
  readonly hud: HudStore;
  readonly createAudio?: () => CarAudio;
  readonly requestFrame?: (cb: (t: number) => void) => number;
  readonly cancelFrame?: (id: number) => void;
  readonly lobby?: Partial<LobbyDeps>;
  readonly clock?: Partial<SessionClock>;
}

export const DEFAULT_LOBBY_DEPS: LobbyDeps = {
  peerFactory: createPeerJsFactory(),
  timers: {
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) =>
      clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
  },
  randomBytes: defaultRandomBytes,
};

export const DEFAULT_CLOCK: SessionClock = {
  now: () => performance.now(),
  randomSeed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
  newMatchId: () => Date.now() % 0x7fffffff,
};

export const DEFAULT_DEPS: SessionDeps = {
  createRenderer: createWorldRenderer,
  hud: hudStore,
  createAudio: () => new CarAudio(),
};

// Globals are read at call time so importing this module stays safe under Node tests.
export function resolveFrameScheduler(
  deps: Pick<SessionDeps, "requestFrame" | "cancelFrame">,
): FrameScheduler {
  return {
    request: (cb) => (deps.requestFrame ?? requestAnimationFrame)(cb),
    cancel: (id) => (deps.cancelFrame ?? cancelAnimationFrame)(id),
  };
}
