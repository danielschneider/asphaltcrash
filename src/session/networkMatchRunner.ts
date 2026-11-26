import { debugLog } from "../config/debugLog";
import { gameConfig } from "../config/gameConfig";
import { buildArenaView } from "../game/arena";
import type { InputBuffer } from "../game/input/InputBuffer";
import { MatchSimulation } from "../game/sim/MatchSimulation";
import type { WorldRenderer } from "../game/Renderer";
import { buildWorldView } from "../game/WorldView";
import type { Transport, Unsubscribe } from "../network/transport/Transport";
import type { NetworkMessage, ScoreItem } from "../network/protocol/messages";
import type { PeerId } from "../types/network";
import { lobbyStore } from "../store/lobbyStore";
import type { ArenaView, BotDifficulty, GameMode } from "../types/game";
import { MatchClient } from "./MatchClient";
import { MatchHost, MATCH_HOST_PHASE } from "./MatchHost";
import { frameSecondsSince } from "./frameSeconds";
import { buildNetworkHud, HudThrottle } from "./networkHud";
import type {
  FrameScheduler,
  LobbyTimers,
  SessionClock,
  SessionDeps,
} from "./sessionDeps";
import { SESSION_STATE, type SessionState } from "./sessionState";

export const HOST_PID = 0;

export interface ClientStart {
  readonly start: NetworkMessage;
  readonly gameMode: GameMode;
  readonly localPid: number;
  readonly transport: Transport;
  readonly hostPeerId: PeerId;
  readonly arena: ArenaView;
  readonly names: ReadonlyMap<number, string>;
}

export interface NetworkMatchContext {
  readonly deps: Pick<SessionDeps, "createRenderer" | "hud">;
  readonly inputBuffer: InputBuffer;
  readonly clock: SessionClock;
  readonly frames: FrameScheduler;
  readonly timers: LobbyTimers;
  getState(): SessionState;
  onMatchEnd(
    scores: readonly ScoreItem[],
    localPid: number,
    winnerPids: readonly number[],
    gameMode: GameMode,
    names: ReadonlyMap<number, string>,
  ): void;
}

export interface HostMatchConfig {
  readonly transport: Transport;
  readonly humanPids: readonly number[];
  readonly botPids: readonly number[];
  readonly botDifficulty: BotDifficulty;
  readonly gameMode: GameMode;
  readonly names: ReadonlyMap<number, string>;
  readonly seed: number;
  readonly pidForPeer: (peerId: PeerId) => number | undefined;
  readonly peerIdForPid: (pid: number) => PeerId | undefined;
}

export class NetworkMatchRunner {
  private matchHost: MatchHost | null = null;
  private matchClient: MatchClient | null = null;
  private matchFrameId: number | null = null;
  private matchUnsubscribe: Unsubscribe | null = null;
  private matchRenderer: WorldRenderer | null = null;
  private matchRendererReady: Promise<void> | null = null;
  private matchSurface: HTMLElement | null = null;
  private pendingStart: ClientStart | null = null;
  private clientStart: ClientStart | null = null;
  private clientStartSeen = false;
  private hostRenderMs: number | null = null;
  private readonly hudThrottle = new HudThrottle(gameConfig.hudHz);
  private matchFrames = 0;

  constructor(private readonly ctx: NetworkMatchContext) {}

  prepareHost(config: HostMatchConfig): void {
    this.matchHost = new MatchHost({
      transport: config.transport,
      now: this.ctx.clock.now,
      setTimeout: this.ctx.timers.setTimeout,
      clearTimeout: this.ctx.timers.clearTimeout,
      newMatchId: this.ctx.clock.newMatchId,
      makeSim: (setup) => new MatchSimulation(setup),
      seed: config.seed,
      humanPids: config.humanPids,
      botPids: config.botPids,
      botDifficulty: config.botDifficulty,
      gameMode: config.gameMode,
      names: config.names,
      matchSeconds: gameConfig.matchSeconds,
      pidForPeer: config.pidForPeer,
      peerIdForPid: config.peerIdForPid,
      hostInput: () => this.ctx.inputBuffer.latest(),
      onFinished: (scores, winners) =>
        this.ctx.onMatchEnd(
          scores,
          HOST_PID,
          winners,
          config.gameMode,
          config.names,
        ),
    });
    this.matchUnsubscribe = config.transport.onMessage(
      (msg: NetworkMessage, from) => {
        this.matchHost?.handleInbound(msg, from);
      },
    );
    this.hostRenderMs = null;
    this.hudThrottle.reset();
  }

  startHost(): void {
    this.matchHost?.start();
    debugLog(
      "mp:host",
      () => `matchHost.start returned phase=${this.matchHost?.phase ?? "none"}`,
    );
    this.startFrameLoop();
  }

  attachRenderer(host: HTMLElement): Promise<void> {
    debugLog(
      "mp:render",
      () =>
        `attachMatchRenderer state=${this.ctx.getState()} rendererExists=${this.matchRenderer !== null} hostClient=${this.matchClient !== null}`,
    );
    if (this.matchSurface === host && this.matchRendererReady !== null) {
      return this.matchRendererReady;
    }
    this.releaseRenderer();
    this.matchSurface = host;
    const ready = this.ctx.deps
      .createRenderer(host, this.currentArena())
      .then((renderer) => this.adoptRenderer(host, renderer));
    this.matchRendererReady = ready;
    return ready;
  }

  stageClientStart(start: ClientStart): void {
    this.clientStartSeen = true;
    this.clientStart = start;
    this.pendingStart = start;
  }

  hasClientStart(): boolean {
    return this.clientStartSeen;
  }

  hasSurface(): boolean {
    return this.matchSurface !== null;
  }

  startPendingClient(): void {
    const pending = this.pendingStart;
    const renderer = this.matchRenderer;
    if (pending === null || renderer === null || this.matchClient !== null) {
      return;
    }
    this.pendingStart = null;
    this.matchClient = new MatchClient({
      transport: pending.transport,
      hostPeerId: pending.hostPeerId,
      localPid: pending.localPid,
      renderer,
      inputBuffer: this.ctx.inputBuffer,
      hud: this.ctx.deps.hud,
      now: this.ctx.clock.now,
      requestFrame: this.ctx.frames.request,
      cancelFrame: this.ctx.frames.cancel,
      onEnd: (msg) =>
        this.ctx.onMatchEnd(
          msg.scores,
          pending.localPid,
          msg.winners,
          pending.gameMode,
          pending.names,
        ),
    });
    debugLog("mp:client", "MatchClient.start");
    this.matchClient.start(pending.start);
  }

  // Lobby transport and roster survive a finished match; only per-match state is cleared here.
  reset(): void {
    this.cancelMatchFrame();
    this.matchUnsubscribe?.();
    this.matchUnsubscribe = null;
    this.matchHost = null;
    this.hostRenderMs = null;
    this.clientStart = null;
    this.clientStartSeen = false;
    this.pendingStart = null;
    this.releaseRenderer();
  }

  private adoptRenderer(host: HTMLElement, renderer: WorldRenderer): void {
    if (this.matchSurface !== host) {
      renderer.destroy();
      return;
    }
    this.matchRenderer = renderer;
    debugLog("mp:render", "match renderer created");
    this.startPendingClient();
  }

  private releaseRenderer(): void {
    this.matchClient?.stop();
    this.matchClient = null;
    this.matchRenderer?.destroy();
    this.matchRenderer = null;
    this.matchRendererReady = null;
    this.matchSurface = null;
    if (this.clientStart !== null) this.pendingStart = this.clientStart;
  }

  private currentArena(): ArenaView {
    if (this.matchHost !== null) return this.matchHost.arena;
    const start = this.pendingStart ?? this.clientStart;
    if (start !== null) return start.arena;
    return buildArenaView(
      lobbyStore.getSnapshot().players.map((p) => p.pid),
      [],
    );
  }

  private startFrameLoop(): void {
    const loop = (now: number): void => {
      if (this.ctx.getState() !== SESSION_STATE.playingNetwork) return;
      this.matchHost?.tick(now);
      this.renderHostFrame(now);
      this.logMatchFrame();
      this.matchFrameId = this.ctx.frames.request(loop);
    };
    this.matchFrameId = this.ctx.frames.request(loop);
  }

  private cancelMatchFrame(): void {
    if (this.matchFrameId === null) return;
    this.ctx.frames.cancel(this.matchFrameId);
    this.matchFrameId = null;
  }

  private renderHostFrame(nowMs: number): void {
    const host = this.matchHost;
    const renderer = this.matchRenderer;
    if (host === null || renderer === null) return;
    if (host.phase !== MATCH_HOST_PHASE.running) return;
    const dtSeconds = frameSecondsSince(this.hostRenderMs, nowMs);
    this.hostRenderMs = nowMs;
    const snapshot = host.snapshot();
    renderer.update(
      buildWorldView(
        host.renderSnapshot(),
        host.arena,
        HOST_PID,
        host.carNames,
      ),
      dtSeconds,
    );
    if (this.hudThrottle.tick(dtSeconds)) {
      this.ctx.deps.hud.push(
        buildNetworkHud(
          snapshot,
          HOST_PID,
          host.gameMode,
          snapshot.timeRemainingMs,
          host.connectivity(nowMs) ?? undefined,
        ),
      );
    }
  }

  private logMatchFrame(): void {
    this.matchFrames += 1;
    if (this.matchFrames !== 1 && this.matchFrames % 60 !== 0) return;
    debugLog(
      "mp:frame",
      () =>
        `n=${this.matchFrames} matchHost=${this.matchHost !== null} matchClient=${this.matchClient !== null} matchRenderer=${this.matchRenderer !== null} hostPhase=${this.matchHost?.phase ?? "none"}`,
    );
  }
}
