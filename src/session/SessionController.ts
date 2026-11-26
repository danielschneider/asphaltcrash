import { debugLog } from "../config/debugLog";
import { gameConfig } from "../config/gameConfig";
import { CarAudio } from "../game/audio/CarAudio";
import type { Engine } from "../game/Engine";
import { InputBuffer } from "../game/input/InputBuffer";
import { MatchSimulation } from "../game/sim/MatchSimulation";
import type { WorldRenderer } from "../game/Renderer";
import { PeerTransport } from "../network/transport/PeerTransport";
import type { Transport, Unsubscribe } from "../network/transport/Transport";
import type { PeerId } from "../types/network";
import {
  attachHandshakeClient,
  sendHello,
  type HandshakeClient,
  type HandshakeOutcome,
} from "../network/session/HandshakeClient";
import { RosterHandshakeHost } from "../network/session/RosterHandshakeHost";
import {
  generateUniqueRoomCode,
  hostPeerIdFor,
  validateRoomCode,
  type RandomBytes,
} from "../network/room/roomCode";
import { clampBotCount, totalCarCount } from "./lobbyRoster";
import { MatchHost, MATCH_HOST_PHASE } from "./MatchHost";
import { MatchClient } from "./MatchClient";
import { frameSecondsSince } from "./frameSeconds";
import { arenaFromStart } from "./startArena";
import { buildNetworkHud, HudThrottle } from "./networkHud";
import { buildWorldView } from "../game/WorldView";
import { buildArenaView } from "../game/arena";
import { parseStart } from "../network/match/startMessage";
import {
  PROTOCOL_VERSION,
  type LobbyMessage,
  type LobbyPlayer as LobbyPlayerItem,
  type NetworkMessage,
  type ScoreItem,
} from "../network/protocol/messages";
import { validateLobbyEnvelope } from "../network/protocol/validate";
import { generatePlayerName, generateUniquePlayerName } from "./playerNames";
import {
  lobbyStore,
  type LobbyPlayer,
  peerErrorToMessage,
  reasonToMessage,
} from "../store/lobbyStore";
import type {
  ArenaView,
  BotDifficulty,
  GameMode,
  MatchSnapshot,
} from "../types/game";
import { isBotDifficulty, isGameMode } from "../types/game";
import {
  DEFAULT_CLOCK,
  DEFAULT_DEPS,
  DEFAULT_LOBBY_DEPS,
  resolveFrameScheduler,
  type FrameScheduler,
  type LobbyDeps,
  type SessionClock,
  type SessionDeps,
  type SoloMatchOptions,
} from "./sessionDeps";
import { buildCarNames, buildEndHud } from "./sessionHud";
import { SESSION_STATE, type SessionState } from "./sessionState";
import { SoloSession } from "./soloSession";

interface ClientStart {
  readonly start: NetworkMessage;
  readonly gameMode: GameMode;
  readonly localPid: number;
  readonly transport: Transport;
  readonly hostPeerId: PeerId;
  readonly arena: ArenaView;
  readonly names: ReadonlyMap<number, string>;
}

export { SESSION_STATE, type SessionState } from "./sessionState";

export type {
  FrameScheduler,
  LobbyDeps,
  LobbyTimers,
  SessionClock,
  SessionDeps,
  SoloMatchOptions,
} from "./sessionDeps";

const HOST_PID = 0;
const HELLO_TOKEN_LENGTH = 16;
const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function createHelloToken(randomBytes: RandomBytes): string {
  return Array.from(randomBytes(HELLO_TOKEN_LENGTH), (byte) =>
    TOKEN_ALPHABET.charAt(byte % TOKEN_ALPHABET.length),
  ).join("");
}

export class SessionController {
  private state: SessionState = SESSION_STATE.idle;
  private readonly listeners = new Set<() => void>();
  private readonly inputBuffer = new InputBuffer();
  private readonly deps: SessionDeps;
  private readonly lobbyDeps: LobbyDeps;
  private readonly clock: SessionClock;
  private readonly frames: FrameScheduler;
  private readonly audio: CarAudio;
  private readonly solo: SoloSession;
  private startToken = 0;
  private lobbyTransport: PeerTransport | null = null;
  private lobbyIsHost = false;
  private handshakeClient: HandshakeClient | null = null;
  private lobbyUnsubscribers: Unsubscribe[] = [];
  private connectTimer: unknown = null;
  private resultTimer: unknown = null;
  private lobbyRoster: RosterHandshakeHost | null = null;
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

  constructor(deps: SessionDeps = DEFAULT_DEPS) {
    this.deps = deps;
    this.lobbyDeps = { ...DEFAULT_LOBBY_DEPS, ...deps.lobby };
    this.clock = { ...DEFAULT_CLOCK, ...deps.clock };
    this.frames = resolveFrameScheduler(deps);
    this.audio = deps.createAudio ? deps.createAudio() : new CarAudio();
    this.solo = new SoloSession({
      createRenderer: deps.createRenderer,
      hud: deps.hud,
      audio: this.audio,
      inputBuffer: this.inputBuffer,
      frames: this.frames,
      onFinished: (snapshot, winnerPids) => this.endMatch(snapshot, winnerPids),
    });
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
    return this.solo.getEngine();
  }

  async startSolo(options: SoloMatchOptions, host: HTMLElement): Promise<void> {
    if (this.state !== SESSION_STATE.idle) {
      throw new Error(
        `SessionController: cannot start solo from state ${this.state}`,
      );
    }
    const token = ++this.startToken;
    const started = await this.solo.start(
      options,
      host,
      () => token === this.startToken && this.state === SESSION_STATE.idle,
    );
    if (!started) return;
    this.setState(SESSION_STATE.playingSolo);
    this.solo.begin();
  }

  endMatch(snapshot?: MatchSnapshot, winnerPids: readonly number[] = []): void {
    if (this.state !== SESSION_STATE.playingSolo || this.resultTimer !== null) {
      return;
    }
    const gameMode = this.solo.finish(snapshot, winnerPids);
    this.scheduleResultTransition(gameMode, winnerPids, () => {
      if (this.state !== SESSION_STATE.playingSolo) return;
      this.setState(SESSION_STATE.ended);
    });
  }

  setPaused(on: boolean): void {
    this.solo.setPaused(on);
  }

  createRoom(name: string): void {
    this.assertIdle("create room");
    const code = generateUniqueRoomCode(
      () => false,
      undefined,
      this.lobbyDeps.randomBytes,
    );
    debugLog("mp:host", () => `createRoom codeOk=${code !== null}`);
    if (code === null) {
      lobbyStore.set({ status: "error", error: "Could not create room" });
      return;
    }
    const hostName = name.trim() || generatePlayerName();
    const roster = new RosterHandshakeHost(
      { pid: HOST_PID, name: hostName },
      (players) => {
        lobbyStore.set({ players });
        this.broadcastLobby();
      },
      (taken) => generateUniquePlayerName(taken),
    );
    this.lobbyRoster = roster;
    this.lobbyIsHost = true;
    this.lobbyTransport = new PeerTransport({
      role: "host",
      peerId: hostPeerIdFor(code),
      peerFactory: this.lobbyDeps.peerFactory,
      handshake: roster,
    });
    this.lobbyUnsubscribers = [
      this.lobbyTransport.onPeerChange((event) => {
        if (
          event.kind === "error" &&
          event.peerId === hostPeerIdFor(code) &&
          this.state === SESSION_STATE.hostingLobby
        ) {
          this.failLobby("connect-error", event.detail);
        }
      }),
    ];
    lobbyStore.set({
      role: "host",
      roomCode: code,
      status: "ready",
      pid: HOST_PID,
      players: [{ pid: HOST_PID, name: hostName }],
      bots: gameConfig.botDefaultCount,
      gameMode: "crashfest",
      botDifficulty: "normal",
      error: null,
    });
    this.setState(SESSION_STATE.hostingLobby);
  }

  setLobbyBotCount(count: number): void {
    if (this.state !== SESSION_STATE.hostingLobby) return;
    lobbyStore.set({ bots: clampBotCount(count) });
    this.broadcastLobby();
  }

  setLobbyGameMode(gameMode: GameMode): void {
    if (this.state !== SESSION_STATE.hostingLobby) return;
    lobbyStore.set({ gameMode });
    this.broadcastLobby();
  }

  setLobbyBotDifficulty(botDifficulty: BotDifficulty): void {
    if (this.state !== SESSION_STATE.hostingLobby) return;
    lobbyStore.set({ botDifficulty });
    this.broadcastLobby();
  }

  private broadcastLobby(): void {
    if (!this.lobbyIsHost || this.lobbyTransport === null) return;
    const snapshot = lobbyStore.getSnapshot();
    this.lobbyTransport.send(
      {
        v: PROTOCOL_VERSION,
        t: "lobby",
        players: snapshot.players.map((player): LobbyPlayerItem => [
          player.pid,
          player.name,
          "h",
          true,
        ]),
        bots: snapshot.bots,
        cfg: {
          gameMode: snapshot.gameMode,
          botDifficulty: snapshot.botDifficulty,
        },
      },
      "reliable",
    );
  }

  startMatch(): void {
    if (
      this.state !== SESSION_STATE.hostingLobby ||
      this.lobbyTransport === null
    ) {
      return;
    }
    const snapshot = lobbyStore.getSnapshot();
    const humans = snapshot.players.map((player) => player.pid);
    const bots = Array.from(
      { length: clampBotCount(snapshot.bots) },
      (_, index) => humans.length + index,
    );
    if (totalCarCount(humans.length, bots.length) < 2) {
      lobbyStore.set({ error: "Need at least 2 cars" });
      return;
    }
    const transport = this.lobbyTransport;
    debugLog(
      "mp:host",
      () => `startMatch humans=${humans.length} bots=${bots.length}`,
    );
    const seed = this.clock.randomSeed();
    const carNames = buildCarNames(snapshot.players, bots.length);
    this.matchHost = new MatchHost({
      transport,
      now: this.clock.now,
      setTimeout: this.lobbyDeps.timers.setTimeout,
      clearTimeout: this.lobbyDeps.timers.clearTimeout,
      newMatchId: this.clock.newMatchId,
      makeSim: (setup) => new MatchSimulation(setup),
      seed,
      humanPids: humans,
      botPids: bots,
      botDifficulty: snapshot.botDifficulty,
      gameMode: snapshot.gameMode,
      names: carNames,
      matchSeconds: gameConfig.matchSeconds,
      pidForPeer: (peerId) => this.lobbyRoster?.pidForPeer(peerId),
      peerIdForPid: (pid) => this.lobbyRoster?.peerIdForPid(pid),
      hostInput: () => this.inputBuffer.latest(),
      onFinished: (scores, winners) =>
        this.finishNetworkMatch(
          scores,
          HOST_PID,
          winners,
          snapshot.gameMode,
          carNames,
        ),
    });
    this.matchUnsubscribe = transport.onMessage((msg: NetworkMessage, from) => {
      this.matchHost?.handleInbound(msg, from);
    });
    this.hostRenderMs = null;
    this.hudThrottle.reset();
    this.setState(SESSION_STATE.playingNetwork);
    this.matchHost.start();
    debugLog(
      "mp:host",
      () => `matchHost.start returned phase=${this.matchHost?.phase ?? "none"}`,
    );
    this.startFrameLoop();
  }

  attachMatchRenderer(host: HTMLElement): Promise<void> {
    debugLog(
      "mp:render",
      () =>
        `attachMatchRenderer state=${this.state} rendererExists=${this.matchRenderer !== null} hostClient=${this.matchClient !== null}`,
    );
    if (this.matchSurface === host && this.matchRendererReady !== null) {
      return this.matchRendererReady;
    }
    this.releaseMatchRenderer();
    this.matchSurface = host;
    const ready = this.deps
      .createRenderer(host, this.currentArena())
      .then((renderer) => this.adoptMatchRenderer(host, renderer));
    this.matchRendererReady = ready;
    return ready;
  }

  private adoptMatchRenderer(host: HTMLElement, renderer: WorldRenderer): void {
    if (this.matchSurface !== host) {
      renderer.destroy();
      return;
    }
    this.matchRenderer = renderer;
    debugLog("mp:render", "match renderer created");
    this.startPendingClient();
  }

  private releaseMatchRenderer(): void {
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

  private startPendingClient(): void {
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
      inputBuffer: this.inputBuffer,
      hud: this.deps.hud,
      now: this.clock.now,
      requestFrame: this.frames.request,
      cancelFrame: this.frames.cancel,
      onEnd: (msg) =>
        this.finishNetworkMatch(
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

  private startFrameLoop(): void {
    const loop = (now: number): void => {
      if (this.state !== SESSION_STATE.playingNetwork) return;
      this.matchHost?.tick(now);
      this.renderHostFrame(now);
      this.logMatchFrame();
      this.matchFrameId = this.frames.request(loop);
    };
    this.matchFrameId = this.frames.request(loop);
  }

  private finishNetworkMatch(
    scores: readonly ScoreItem[],
    localPid: number,
    winnerPids: readonly number[],
    gameMode: GameMode,
    names: ReadonlyMap<number, string>,
  ): void {
    if (
      this.state !== SESSION_STATE.playingNetwork ||
      this.resultTimer !== null
    ) {
      return;
    }
    debugLog("mp:match", "finishNetworkMatch");
    this.deps.hud.push(
      buildEndHud(scores, localPid, gameMode, winnerPids, names),
    );
    this.scheduleResultTransition(gameMode, winnerPids, () => {
      if (this.state !== SESSION_STATE.playingNetwork) return;
      this.resetMatchState();
      this.setState(SESSION_STATE.endedNetwork);
    });
  }

  private scheduleResultTransition(
    gameMode: GameMode,
    winnerPids: readonly number[],
    onComplete: () => void,
  ): void {
    if (gameMode !== "crashfest" || winnerPids.length === 0) {
      onComplete();
      return;
    }
    this.resultTimer = this.lobbyDeps.timers.setTimeout(() => {
      this.resultTimer = null;
      onComplete();
    }, gameConfig.crashfestResultDelaySeconds * 1000);
  }

  private cancelMatchFrame(): void {
    if (this.matchFrameId === null) return;
    this.frames.cancel(this.matchFrameId);
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
      this.deps.hud.push(
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

  // Lobby transport and roster survive a finished match; only per-match state is cleared here.
  private resetMatchState(): void {
    this.cancelMatchFrame();
    this.matchUnsubscribe?.();
    this.matchUnsubscribe = null;
    this.matchHost = null;
    this.hostRenderMs = null;
    this.clientStart = null;
    this.clientStartSeen = false;
    this.pendingStart = null;
    this.releaseMatchRenderer();
  }

  returnToLobby(): void {
    if (
      this.state !== SESSION_STATE.endedNetwork ||
      this.lobbyTransport === null
    ) {
      return;
    }
    this.setState(
      this.lobbyIsHost ? SESSION_STATE.hostingLobby : SESSION_STATE.joinedLobby,
    );
  }

  joinRoom(code: string, name: string): void {
    this.assertIdle("join room");
    debugLog("mp:client", "joinRoom");
    if (!validateRoomCode(code)) {
      lobbyStore.set({ status: "error", error: "Invalid room code" });
      return;
    }
    const hostPeerId = hostPeerIdFor(code);
    const transport = new PeerTransport({
      role: "client",
      hostPeerId,
      peerFactory: this.lobbyDeps.peerFactory,
    });
    const handshake = attachHandshakeClient(transport, hostPeerId);
    const token = createHelloToken(this.lobbyDeps.randomBytes);
    this.lobbyTransport = transport;
    this.lobbyIsHost = false;
    this.handshakeClient = handshake;
    this.lobbyUnsubscribers = [
      transport.onPeerChange((event) => {
        if (event.peerId !== hostPeerId) {
          return;
        }
        if (event.kind === "open") {
          sendHello(transport, name.trim(), token);
        } else if (
          event.kind === "close" &&
          this.state !== SESSION_STATE.idle
        ) {
          this.failLobby("host-left");
        } else if (
          event.kind === "error" &&
          this.state === SESSION_STATE.joining
        ) {
          this.failLobby("connect-error", event.detail);
        }
      }),
      handshake.onOutcome((outcome) => this.handleHandshakeOutcome(outcome)),
      transport.onMessage((msg: NetworkMessage, from) => {
        if (from === hostPeerId && msg.t === "lobby") {
          this.applyLobbyMessage(msg);
        }
      }),
    ];
    this.connectTimer = this.lobbyDeps.timers.setTimeout(() => {
      this.connectTimer = null;
      this.failLobby("timeout");
    }, gameConfig.lobbyConnectTimeoutMs);
    lobbyStore.set({
      role: "client",
      roomCode: code,
      status: "connecting",
      pid: null,
      players: [],
      bots: 0,
      error: null,
    });
    this.setState(SESSION_STATE.joining);
  }

  backToIdle(): void {
    this.startToken += 1;
    if (this.resultTimer !== null) {
      this.lobbyDeps.timers.clearTimeout(this.resultTimer);
      this.resultTimer = null;
    }
    this.resetMatchState();
    this.solo.dispose();
    this.audio.dispose();
    if (this.lobbyTransport !== null) {
      this.teardownLobby();
      lobbyStore.reset();
    }
    this.setState(SESSION_STATE.idle);
  }

  private handleHandshakeOutcome(outcome: HandshakeOutcome): void {
    if (outcome.kind === "reject") {
      this.failLobby(outcome.reason);
      return;
    }
    this.clearConnectTimer();
    lobbyStore.set({ status: "ready", pid: outcome.pid, error: null });
    this.setState(SESSION_STATE.joinedLobby);
    this.listenForMatchStart(outcome.pid);
  }

  private listenForMatchStart(localPid: number): void {
    const transport = this.lobbyTransport;
    if (transport === null) return;
    this.lobbyUnsubscribers.push(
      transport.onMessage((msg: NetworkMessage) => {
        if (msg.t !== "start" || this.clientStartSeen) return;
        this.beginClientMatch(msg, localPid);
      }),
    );
  }

  private applyLobbyMessage(msg: LobbyMessage): void {
    if (this.lobbyIsHost) return;
    const parsed = validateLobbyEnvelope(msg);
    if (!parsed.ok) return;
    const { cfg } = parsed.value;
    if (!isGameMode(cfg.gameMode) || !isBotDifficulty(cfg.botDifficulty)) {
      return;
    }
    lobbyStore.set({
      players: parsed.value.players.map(([pid, name]): LobbyPlayer => ({
        pid,
        name,
      })),
      bots: parsed.value.bots,
      gameMode: cfg.gameMode,
      botDifficulty: cfg.botDifficulty,
    });
  }

  private beginClientMatch(msg: NetworkMessage, localPid: number): void {
    const parsed = parseStart(msg);
    const transport = this.lobbyTransport;
    debugLog(
      "mp:client",
      () =>
        `beginClientMatch parsed=${parsed.ok} transport=${transport !== null} surface=${this.matchSurface !== null}`,
    );
    if (!parsed.ok || transport === null) return;
    this.clientStartSeen = true;
    const start: ClientStart = {
      start: msg,
      gameMode: parsed.value.gameMode,
      localPid,
      transport,
      hostPeerId: hostPeerIdFor(lobbyStore.getSnapshot().roomCode ?? ""),
      arena: arenaFromStart(parsed.value),
      names: new Map(parsed.value.names ?? []),
    };
    this.clientStart = start;
    this.pendingStart = start;
    this.setState(SESSION_STATE.playingNetwork);
    this.startPendingClient();
  }

  private failLobby(reason: string, detail?: string): void {
    this.resetMatchState();
    this.teardownLobby();
    lobbyStore.set({
      role: "none",
      roomCode: null,
      status: "error",
      pid: null,
      players: [],
      bots: 0,
      error:
        reason === "connect-error"
          ? peerErrorToMessage(detail)
          : reasonToMessage(reason),
    });
    this.setState(SESSION_STATE.idle);
  }

  private teardownLobby(): void {
    this.clearConnectTimer();
    this.lobbyIsHost = false;
    for (const unsubscribe of this.lobbyUnsubscribers) {
      unsubscribe();
    }
    this.lobbyUnsubscribers = [];
    this.handshakeClient?.dispose();
    this.handshakeClient = null;
    this.lobbyTransport?.close();
    this.lobbyTransport = null;
    this.lobbyRoster = null;
  }

  private clearConnectTimer(): void {
    if (this.connectTimer === null) return;
    this.lobbyDeps.timers.clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private assertIdle(action: string): void {
    if (this.state !== SESSION_STATE.idle) {
      throw new Error(
        `SessionController: cannot ${action} from state ${this.state}`,
      );
    }
  }

  private setState(next: SessionState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const sessionController = new SessionController();
