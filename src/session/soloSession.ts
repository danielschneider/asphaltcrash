import type { CarAudio } from "../game/audio/CarAudio";
import { Engine } from "../game/Engine";
import type { InputSource } from "../game/input/InputSource";
import type { InputBuffer } from "../game/input/InputBuffer";
import { createInputBufferSource } from "../game/input/LocalInputSource";
import { MatchSimulation } from "../game/sim/MatchSimulation";
import type { WorldRenderer } from "../game/Renderer";
import type { HudStore } from "../store/hudStore";
import type { GameMode, MatchSnapshot } from "../types/game";
import {
  LOCAL_PLAYER_ID,
  type FrameScheduler,
  type SessionDeps,
  type SoloMatchOptions,
} from "./sessionDeps";
import {
  buildCarNames,
  buildEndHud,
  buildSoloSetup,
  scoresFromSnapshot,
} from "./sessionHud";

export interface SoloSessionDeps {
  readonly createRenderer: SessionDeps["createRenderer"];
  readonly hud: HudStore;
  readonly audio: CarAudio;
  readonly inputBuffer: InputBuffer;
  readonly frames: FrameScheduler;
  readonly onFinished: (
    snapshot?: MatchSnapshot,
    winnerPids?: readonly number[],
  ) => void;
}

export class SoloSession {
  private engine: Engine | null = null;
  private renderer: WorldRenderer | null = null;
  private unsubscribeHud: (() => void) | null = null;
  private gameMode: GameMode = "crashfest";
  private names: ReadonlyMap<number, string> = new Map();

  constructor(private readonly deps: SoloSessionDeps) {}

  async start(
    options: SoloMatchOptions,
    host: HTMLElement,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    const sim = new MatchSimulation(buildSoloSetup(options));
    this.gameMode = options.gameMode;
    this.names = buildCarNames(
      [{ pid: LOCAL_PLAYER_ID, name: "Player" }],
      options.botCount,
    );
    const renderer = await this.deps.createRenderer(host, sim.arena);
    if (!isCurrent()) {
      renderer.destroy();
      return false;
    }
    this.renderer = renderer;
    const inputSources: readonly InputSource[] = [
      createInputBufferSource(LOCAL_PLAYER_ID, this.deps.inputBuffer),
    ];
    this.engine = new Engine({
      sim,
      renderer,
      inputSources,
      localPlayerId: LOCAL_PLAYER_ID,
      carNames: this.names,
      hud: this.deps.hud,
      audio: this.deps.audio,
      onFinished: (snapshot, winnerPids) =>
        this.deps.onFinished(snapshot, winnerPids),
      requestFrame: this.deps.frames.request,
      cancelFrame: this.deps.frames.cancel,
    });
    this.watchForMatchEnd();
    return true;
  }

  begin(): void {
    this.engine?.start();
  }

  finish(
    snapshot?: MatchSnapshot,
    winnerPids: readonly number[] = [],
  ): GameMode {
    this.engine?.stop();
    this.deps.audio.dispose();
    this.detachHud();
    if (snapshot !== undefined) {
      this.deps.hud.push(
        buildEndHud(
          scoresFromSnapshot(snapshot.cars, this.gameMode),
          LOCAL_PLAYER_ID,
          this.gameMode,
          winnerPids,
          this.names,
        ),
      );
    }
    return this.gameMode;
  }

  setPaused(on: boolean): void {
    this.engine?.setPaused(on);
  }

  getEngine(): Engine | null {
    return this.engine;
  }

  dispose(): void {
    this.detachHud();
    this.engine?.dispose();
    this.engine = null;
    this.renderer?.destroy();
    this.renderer = null;
  }

  private watchForMatchEnd(): void {
    this.detachHud();
    this.unsubscribeHud = this.deps.hud.subscribe(() => {
      const snapshot = this.deps.hud.getSnapshot();
      if (snapshot.gameMode === "crashfest") return;
      if (snapshot.remainingMs > 0) return;
      this.deps.onFinished();
    });
  }

  private detachHud(): void {
    this.unsubscribeHud?.();
    this.unsubscribeHud = null;
  }
}
