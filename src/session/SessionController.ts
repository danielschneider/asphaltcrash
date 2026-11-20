import { CarAudio } from "../game/audio/CarAudio";
import { Engine } from "../game/Engine";
import { InputBuffer } from "../game/input/InputBuffer";
import { createInputBufferSource } from "../game/input/LocalInputSource";
import type { InputSource } from "../game/input/InputSource";
import { MatchSimulation } from "../game/sim/MatchSimulation";
import { createWorldRenderer, type WorldRenderer } from "../game/Renderer";
import { hudStore, type HudStore } from "../store/hudStore";
import type { ArenaView, BotDifficulty, MatchSetup } from "../types/game";

export const SESSION_STATE = {
  idle: "idle",
  playingSolo: "playingSolo",
  ended: "ended",
  hostingLobby: "hostingLobby",
  joining: "joining",
  joinedLobby: "joinedLobby",
  playingNetwork: "playingNetwork",
  reconnecting: "reconnecting",
} as const;

export type SessionState = (typeof SESSION_STATE)[keyof typeof SESSION_STATE];

export interface SoloMatchOptions {
  readonly botCount: number;
  readonly botDifficulty: BotDifficulty;
  readonly matchSeconds: number;
  readonly seed: number;
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
}

const LOCAL_PLAYER_ID = 0;
const DEFAULT_DEPS: SessionDeps = {
  createRenderer: createWorldRenderer,
  hud: hudStore,
  createAudio: () => new CarAudio(),
};

function buildSoloSetup(options: SoloMatchOptions): MatchSetup {
  const botPlayerIds = Array.from(
    { length: options.botCount },
    (_, index) => index + 1,
  );
  return {
    seed: options.seed,
    humanPlayerIds: [LOCAL_PLAYER_ID],
    botPlayerIds,
    botDifficulty: options.botDifficulty,
    matchSeconds: options.matchSeconds,
  };
}

export class SessionController {
  private state: SessionState = SESSION_STATE.idle;
  private readonly listeners = new Set<() => void>();
  private readonly inputBuffer = new InputBuffer();
  private readonly deps: SessionDeps;
  private engine: Engine | null = null;
  private renderer: WorldRenderer | null = null;
  private readonly audio: CarAudio;
  private unsubscribeHud: (() => void) | null = null;
  private startToken = 0;

  constructor(deps: SessionDeps = DEFAULT_DEPS) {
    this.deps = deps;
    this.audio = deps.createAudio ? deps.createAudio() : new CarAudio();
  }

  // Must run synchronously inside a user gesture (Play tap) so iOS Safari allows playback.
  unlockAudio(): void {
    this.audio.unlock();
  }

  getState(): SessionState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getInputBuffer(): InputBuffer {
    return this.inputBuffer;
  }

  getEngine(): Engine | null {
    return this.engine;
  }

  async startSolo(options: SoloMatchOptions, host: HTMLElement): Promise<void> {
    if (this.state !== SESSION_STATE.idle) {
      throw new Error(
        `SessionController: cannot start solo from state ${this.state}`,
      );
    }
    const token = ++this.startToken;
    const sim = new MatchSimulation(buildSoloSetup(options));
    const renderer = await this.deps.createRenderer(host, sim.arena);
    if (token !== this.startToken || this.state !== SESSION_STATE.idle) {
      renderer.destroy();
      return;
    }
    this.renderer = renderer;
    const inputSources: readonly InputSource[] = [
      createInputBufferSource(LOCAL_PLAYER_ID, this.inputBuffer),
    ];
    this.engine = new Engine({
      sim,
      renderer,
      inputSources,
      localPlayerId: LOCAL_PLAYER_ID,
      hud: this.deps.hud,
      audio: this.audio,
      ...(this.deps.requestFrame
        ? { requestFrame: this.deps.requestFrame }
        : {}),
      ...(this.deps.cancelFrame ? { cancelFrame: this.deps.cancelFrame } : {}),
    });
    this.watchForMatchEnd();
    this.setState(SESSION_STATE.playingSolo);
    this.engine.start();
  }

  endMatch(): void {
    this.engine?.stop();
    this.audio.dispose();
    this.detachHud();
    if (this.state === SESSION_STATE.playingSolo) {
      this.setState(SESSION_STATE.ended);
    }
  }

  setPaused(on: boolean): void {
    this.engine?.setPaused(on);
  }

  backToIdle(): void {
    this.startToken += 1;
    this.detachHud();
    this.engine?.dispose();
    this.engine = null;
    this.audio.dispose();
    this.renderer?.destroy();
    this.renderer = null;
    this.setState(SESSION_STATE.idle);
  }

  private watchForMatchEnd(): void {
    this.detachHud();
    this.unsubscribeHud = this.deps.hud.subscribe(() => {
      if (this.deps.hud.getSnapshot().remainingMs > 0) return;
      this.endMatch();
    });
  }

  private detachHud(): void {
    this.unsubscribeHud?.();
    this.unsubscribeHud = null;
  }

  private setState(next: SessionState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const sessionController = new SessionController();
