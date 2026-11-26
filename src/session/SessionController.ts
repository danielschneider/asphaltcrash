import { debugLog } from "../config/debugLog";
import { gameConfig } from "../config/gameConfig";
import { CarAudio } from "../game/audio/CarAudio";
import type { Engine } from "../game/Engine";
import { InputBuffer } from "../game/input/InputBuffer";
import type { NetworkMessage, ScoreItem } from "../network/protocol/messages";
import { lobbyStore } from "../store/lobbyStore";
import type { BotDifficulty, GameMode, MatchSnapshot } from "../types/game";
import { ClientLobby } from "./clientLobby";
import { LobbyConnection, lobbyErrorMessage } from "./lobbyConnection";
import { HostLobby } from "./hostLobby";
import { NetworkMatchRunner } from "./networkMatchRunner";
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
import { buildEndHud } from "./sessionHud";
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
  private resultTimer: unknown = null;
  private readonly lobby: LobbyConnection;
  private readonly hostLobby: HostLobby;
  private readonly clientLobby: ClientLobby;
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
    this.lobby = new LobbyConnection(this.lobbyDeps.timers);
    this.hostLobby = new HostLobby(
      {
        lobbyDeps: this.lobbyDeps,
        clock: this.clock,
        getState: () => this.state,
        onFail: (reason, detail) => this.failLobby(reason, detail),
      },
      this.lobby,
    );
    this.clientLobby = new ClientLobby(
      {
        lobbyDeps: this.lobbyDeps,
        getState: () => this.state,
        onFail: (reason, detail) => this.failLobby(reason, detail),
        onJoined: () => this.setState(SESSION_STATE.joinedLobby),
        onMatchStart: (msg, localPid) => this.beginClientMatch(msg, localPid),
      },
      this.lobby,
    );
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
    if (!this.hostLobby.create(name)) return;
    this.setState(SESSION_STATE.hostingLobby);
  }

  setLobbyBotCount(count: number): void {
    if (this.state !== SESSION_STATE.hostingLobby) return;
    this.hostLobby.setBotCount(count);
  }

  setLobbyGameMode(gameMode: GameMode): void {
    if (this.state !== SESSION_STATE.hostingLobby) return;
    this.hostLobby.setGameMode(gameMode);
  }

  setLobbyBotDifficulty(botDifficulty: BotDifficulty): void {
    if (this.state !== SESSION_STATE.hostingLobby) return;
    this.hostLobby.setBotDifficulty(botDifficulty);
  }

  startMatch(): void {
    if (
      this.state !== SESSION_STATE.hostingLobby ||
      this.lobby.transport === null
    ) {
      return;
    }
    const config = this.hostLobby.buildMatchConfig();
    if (config === null) return;
    this.matchRunner.prepareHost(config);
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
      this.lobby.transport === null
    ) {
      return;
    }
    this.setState(
      this.lobby.isHost
        ? SESSION_STATE.hostingLobby
        : SESSION_STATE.joinedLobby,
    );
  }

  joinRoom(code: string, name: string): void {
    this.assertIdle("join room");
    if (!this.clientLobby.join(code, name)) return;
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
    if (this.lobby.transport !== null) {
      this.lobby.teardown();
      lobbyStore.reset();
    }
    this.setState(SESSION_STATE.idle);
  }

  private beginClientMatch(msg: NetworkMessage, localPid: number): void {
    if (this.matchRunner.hasClientStart()) return;
    const start = this.clientLobby.buildStart(msg, localPid, () =>
      this.matchRunner.hasSurface(),
    );
    if (start === null) return;
    this.matchRunner.stageClientStart(start);
    this.setState(SESSION_STATE.playingNetwork);
    this.matchRunner.startPendingClient();
  }

  private failLobby(reason: string, detail?: string): void {
    this.matchRunner.reset();
    this.lobby.teardown();
    lobbyStore.set({
      role: "none",
      roomCode: null,
      status: "error",
      pid: null,
      players: [],
      bots: 0,
      error: lobbyErrorMessage(reason, detail),
    });
    this.setState(SESSION_STATE.idle);
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
