import { debugLog } from "../config/debugLog";
import { gameConfig } from "../config/gameConfig";
import {
  generateUniqueRoomCode,
  hostPeerIdFor,
} from "../network/room/roomCode";
import {
  PROTOCOL_VERSION,
  type LobbyPlayer as LobbyPlayerItem,
} from "../network/protocol/messages";
import { RosterHandshakeHost } from "../network/session/RosterHandshakeHost";
import { PeerTransport } from "../network/transport/PeerTransport";
import { lobbyStore } from "../store/lobbyStore";
import type { BotDifficulty, GameMode } from "../types/game";
import type { LobbyConnection } from "./lobbyConnection";
import { clampBotCount, totalCarCount } from "./lobbyRoster";
import { HOST_PID, type HostMatchConfig } from "./networkMatchRunner";
import { generatePlayerName, generateUniquePlayerName } from "./playerNames";
import type { LobbyDeps, SessionClock } from "./sessionDeps";
import { buildCarNames } from "./sessionHud";
import { SESSION_STATE, type SessionState } from "./sessionState";

export interface HostLobbyContext {
  readonly lobbyDeps: LobbyDeps;
  readonly clock: Pick<SessionClock, "randomSeed">;
  getState(): SessionState;
  onFail(reason: string, detail?: string): void;
}

export class HostLobby {
  constructor(
    private readonly ctx: HostLobbyContext,
    private readonly conn: LobbyConnection,
  ) {}

  create(name: string): boolean {
    const code = generateUniqueRoomCode(
      () => false,
      undefined,
      this.ctx.lobbyDeps.randomBytes,
    );
    debugLog("mp:host", () => `createRoom codeOk=${code !== null}`);
    if (code === null) {
      lobbyStore.set({ status: "error", error: "Could not create room" });
      return false;
    }
    const hostPeerId = hostPeerIdFor(code);
    const hostName = name.trim() || generatePlayerName();
    const roster = new RosterHandshakeHost(
      { pid: HOST_PID, name: hostName },
      (players) => {
        lobbyStore.set({ players });
        this.broadcast();
      },
      (taken) => generateUniquePlayerName(taken),
    );
    this.conn.roster = roster;
    this.conn.isHost = true;
    const transport = new PeerTransport({
      role: "host",
      peerId: hostPeerId,
      peerFactory: this.ctx.lobbyDeps.peerFactory,
      handshake: roster,
    });
    this.conn.transport = transport;
    this.conn.track(
      transport.onPeerChange((event) => {
        if (
          event.kind === "error" &&
          event.peerId === hostPeerId &&
          this.ctx.getState() === SESSION_STATE.hostingLobby
        ) {
          this.ctx.onFail("connect-error", event.detail);
        }
      }),
    );
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
    return true;
  }

  setBotCount(count: number): void {
    lobbyStore.set({ bots: clampBotCount(count) });
    this.broadcast();
  }

  setGameMode(gameMode: GameMode): void {
    lobbyStore.set({ gameMode });
    this.broadcast();
  }

  setBotDifficulty(botDifficulty: BotDifficulty): void {
    lobbyStore.set({ botDifficulty });
    this.broadcast();
  }

  broadcast(): void {
    const transport = this.conn.transport;
    if (!this.conn.isHost || transport === null) return;
    const snapshot = lobbyStore.getSnapshot();
    transport.send(
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

  buildMatchConfig(): HostMatchConfig | null {
    const transport = this.conn.transport;
    if (transport === null) return null;
    const snapshot = lobbyStore.getSnapshot();
    const humans = snapshot.players.map((player) => player.pid);
    const bots = Array.from(
      { length: clampBotCount(snapshot.bots) },
      (_, index) => humans.length + index,
    );
    if (totalCarCount(humans.length, bots.length) < 2) {
      lobbyStore.set({ error: "Need at least 2 cars" });
      return null;
    }
    debugLog(
      "mp:host",
      () => `startMatch humans=${humans.length} bots=${bots.length}`,
    );
    return {
      transport,
      humanPids: humans,
      botPids: bots,
      botDifficulty: snapshot.botDifficulty,
      gameMode: snapshot.gameMode,
      names: buildCarNames(snapshot.players, bots.length),
      seed: this.ctx.clock.randomSeed(),
      pidForPeer: (peerId) => this.conn.roster?.pidForPeer(peerId),
      peerIdForPid: (pid) => this.conn.roster?.peerIdForPid(pid),
    };
  }
}
