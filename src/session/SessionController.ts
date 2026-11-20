import { gameConfig } from "../config/gameConfig";
import { CarAudio } from "../game/audio/CarAudio";
import { Engine } from "../game/Engine";
import { InputBuffer } from "../game/input/InputBuffer";
import { createInputBufferSource } from "../game/input/LocalInputSource";
import type { InputSource } from "../game/input/InputSource";
import { MatchSimulation } from "../game/sim/MatchSimulation";
import { createWorldRenderer, type WorldRenderer } from "../game/Renderer";
import { createPeerJsFactory } from "../network/transport/peerJsFactory";
import {
  PeerTransport,
  type PeerFactory,
} from "../network/transport/PeerTransport";
import type { Unsubscribe } from "../network/transport/Transport";
import {
  attachHandshakeClient,
  sendHello,
  type HandshakeClient,
  type HandshakeOutcome,
} from "../network/session/HandshakeClient";
import { RosterHandshakeHost } from "../network/session/RosterHandshakeHost";
import {
  defaultRandomBytes,
  generateUniqueRoomCode,
  hostPeerIdFor,
  validateRoomCode,
  type RandomBytes,
} from "../network/room/roomCode";
import { clampBotCount, totalCarCount } from "./lobbyRoster";
import { MatchHost } from "./MatchHost";
import { MatchClient } from "./MatchClient";
import { buildArenaView } from "../game/arena";
import { parseStart } from "../network/match/startMessage";
import type { NetworkMessage } from "../network/protocol/messages";
import { generatePlayerName, generateUniquePlayerName } from "./playerNames";
import { hudStore, type HudStore } from "../store/hudStore";
import {
  lobbyStore,
  peerErrorToMessage,
  reasonToMessage,
} from "../store/lobbyStore";
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

export interface LobbyTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface LobbyDeps {
  readonly peerFactory: PeerFactory;
  readonly timers: LobbyTimers;
  readonly randomBytes: RandomBytes;
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
}

const LOCAL_PLAYER_ID = 0;
const HOST_PID = 0;
const HELLO_TOKEN_LENGTH = 16;
const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const DEFAULT_LOBBY_DEPS: LobbyDeps = {
  peerFactory: createPeerJsFactory(),
  timers: {
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) =>
      clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
  },
  randomBytes: defaultRandomBytes,
};
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
  private engine: Engine | null = null;
  private renderer: WorldRenderer | null = null;
  private readonly audio: CarAudio;
  private unsubscribeHud: (() => void) | null = null;
  private startToken = 0;
  private lobbyTransport: PeerTransport | null = null;
  private handshakeClient: HandshakeClient | null = null;
  private lobbyUnsubscribers: Unsubscribe[] = [];
  private connectTimer: unknown = null;
  private lobbyRoster: RosterHandshakeHost | null = null;
  private matchHost: MatchHost | null = null;
  private matchClient: MatchClient | null = null;
  private matchFrameId: number | null = null;
  private matchRenderer: WorldRenderer | null = null;

  constructor(deps: SessionDeps = DEFAULT_DEPS) {
    this.deps = deps;
    this.lobbyDeps = { ...DEFAULT_LOBBY_DEPS, ...deps.lobby };
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

  createRoom(name: string): void {
    this.assertIdle("create room");
    const code = generateUniqueRoomCode(
      () => false,
      undefined,
      this.lobbyDeps.randomBytes,
    );
    if (code === null) {
      lobbyStore.set({ status: "error", error: "Could not create room" });
      return;
    }
    const hostName = name.trim() || generatePlayerName();
    const roster = new RosterHandshakeHost(
      { pid: HOST_PID, name: hostName },
      (players) => lobbyStore.set({ players }),
      (taken) => generateUniquePlayerName(taken),
    );
    this.lobbyRoster = roster;
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
      bots: 0,
      error: null,
    });
    this.setState(SESSION_STATE.hostingLobby);
  }

  // Local only: the CPU count is not sent to clients and does not yet reach the match.
  setLobbyBotCount(count: number): void {
    if (this.state !== SESSION_STATE.hostingLobby) return;
    lobbyStore.set({ bots: clampBotCount(count) });
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
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    this.matchHost = new MatchHost({
      transport,
      now: () => performance.now(),
      setTimeout: (handler, ms) => setTimeout(handler, ms),
      clearTimeout: (handle) =>
        clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
      newMatchId: () => Date.now() % 0x7fffffff,
      makeSim: (setup) => new MatchSimulation(setup),
      seed,
      humanPids: humans,
      botPids: bots,
      botDifficulty: "normal",
      matchSeconds: gameConfig.matchSeconds,
      pidForPeer: (peerId) => this.lobbyRoster?.pidForPeer(peerId),
      peerIdForPid: (pid) => this.lobbyRoster?.peerIdForPid(pid),
      hostInput: () => this.inputBuffer.latest(),
    });
    this.lobbyUnsubscribers.push(
      transport.onMessage((msg: NetworkMessage, from) => {
        this.matchHost?.handleInbound(msg, from);
      }),
    );
    this.setState(SESSION_STATE.playingNetwork);
    this.matchHost.start();
    this.startFrameLoop();
  }

  attachMatchRenderer(host: HTMLElement): Promise<void> {
    return this.createMatchRenderer(host);
  }

  private async createMatchRenderer(host: HTMLElement): Promise<void> {
    const renderer = await this.deps.createRenderer(
      host,
      buildArenaView(
        lobbyStore.getSnapshot().players.map((p) => p.pid),
        [],
      ),
    );
    this.matchRenderer = renderer;
  }

  private startFrameLoop(): void {
    const request =
      this.deps.requestFrame ?? ((cb) => requestAnimationFrame(cb));
    const loop = (now: number): void => {
      if (this.state !== SESSION_STATE.playingNetwork) return;
      this.matchHost?.tick(now);
      this.matchFrameId = request(loop);
    };
    this.matchFrameId = request(loop);
  }

  private stopMatch(): void {
    if (this.matchFrameId !== null) {
      (this.deps.cancelFrame ?? cancelAnimationFrame)(this.matchFrameId);
      this.matchFrameId = null;
    }
    this.matchHost = null;
    this.matchClient?.stop();
    this.matchClient = null;
    this.matchRenderer?.destroy();
    this.matchRenderer = null;
  }

  joinRoom(code: string, name: string): void {
    this.assertIdle("join room");
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
    this.handshakeClient = handshake;
    this.lobbyUnsubscribers = [
      transport.onPeerChange((event) => {
        if (event.peerId !== hostPeerId) {
          return;
        }
        if (event.kind === "open") {
          sendHello(transport, name.trim(), token);
        } else if (
          event.kind === "error" &&
          this.state === SESSION_STATE.joining
        ) {
          this.failLobby("connect-error", event.detail);
        }
      }),
      handshake.onOutcome((outcome) => this.handleHandshakeOutcome(outcome)),
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
    this.stopMatch();
    this.detachHud();
    this.engine?.dispose();
    this.engine = null;
    this.audio.dispose();
    this.renderer?.destroy();
    this.renderer = null;
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
        if (msg.t !== "start" || this.matchClient !== null) return;
        this.beginClientMatch(msg, localPid);
      }),
    );
  }

  private beginClientMatch(msg: NetworkMessage, localPid: number): void {
    const parsed = parseStart(msg);
    const transport = this.lobbyTransport;
    if (!parsed.ok || transport === null) return;
    const hostPeerId = hostPeerIdFor(lobbyStore.getSnapshot().roomCode ?? "");
    const renderer = this.matchRenderer;
    if (renderer === null) return;
    this.matchClient = new MatchClient({
      transport,
      hostPeerId,
      localPid,
      renderer,
      inputBuffer: this.inputBuffer,
      now: () => performance.now(),
      requestFrame: (cb) =>
        (this.deps.requestFrame ?? requestAnimationFrame)(cb),
      cancelFrame: (id) => (this.deps.cancelFrame ?? cancelAnimationFrame)(id),
    });
    this.matchClient.start();
    this.setState(SESSION_STATE.playingNetwork);
  }

  private failLobby(reason: string, detail?: string): void {
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
