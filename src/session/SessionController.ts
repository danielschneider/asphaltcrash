import { debugLog } from "../config/debugLog";
import { gameConfig } from "../config/gameConfig";
import { CarAudio } from "../game/audio/CarAudio";
import type { Engine } from "../game/Engine";
import { InputBuffer } from "../game/input/InputBuffer";
import { PeerTransport } from "../network/transport/PeerTransport";
import type { Unsubscribe } from "../network/transport/Transport";
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
import {
  HOST_PID,
  NetworkMatchRunner,
  type ClientStart,
} from "./networkMatchRunner";
import { arenaFromStart } from "./startArena";
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
import type { BotDifficulty, GameMode, MatchSnapshot } from "../types/game";
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

export { SESSION_STATE, type SessionState } from "./sessionState";

export type {
  FrameScheduler,
  LobbyDeps,
  LobbyTimers,
  SessionClock,
  SessionDeps,
  SoloMatchOptions,
} from "./sessionDeps";

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
  private readonly matchRunner: NetworkMatchRunner;

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
    this.matchRunner = new NetworkMatchRunner({
      deps,
      inputBuffer: this.inputBuffer,
      clock: this.clock,
      frames: this.frames,
      timers: this.lobbyDeps.timers,
      getState: () => this.state,
      onMatchEnd: (scores, localPid, winners, gameMode, names) =>
        this.finishNetworkMatch(scores, localPid, winners, gameMode, names),
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
    this.matchRunner.prepareHost({
      transport,
      humanPids: humans,
      botPids: bots,
      botDifficulty: snapshot.botDifficulty,
      gameMode: snapshot.gameMode,
      names: carNames,
      seed,
      pidForPeer: (peerId) => this.lobbyRoster?.pidForPeer(peerId),
      peerIdForPid: (pid) => this.lobbyRoster?.peerIdForPid(pid),
    });
    this.setState(SESSION_STATE.playingNetwork);
    this.matchRunner.startHost();
  }

  attachMatchRenderer(host: HTMLElement): Promise<void> {
    return this.matchRunner.attachRenderer(host);
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
      this.matchRunner.reset();
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
    this.matchRunner.reset();
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
        if (msg.t !== "start" || this.matchRunner.hasClientStart()) return;
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
        `beginClientMatch parsed=${parsed.ok} transport=${transport !== null} surface=${this.matchRunner.hasSurface()}`,
    );
    if (!parsed.ok || transport === null) return;
    const start: ClientStart = {
      start: msg,
      gameMode: parsed.value.gameMode,
      localPid,
      transport,
      hostPeerId: hostPeerIdFor(lobbyStore.getSnapshot().roomCode ?? ""),
      arena: arenaFromStart(parsed.value),
      names: new Map(parsed.value.names ?? []),
    };
    this.matchRunner.stageClientStart(start);
    this.setState(SESSION_STATE.playingNetwork);
    this.matchRunner.startPendingClient();
  }

  private failLobby(reason: string, detail?: string): void {
    this.matchRunner.reset();
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
