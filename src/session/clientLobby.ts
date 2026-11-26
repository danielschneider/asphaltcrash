import { debugLog } from "../config/debugLog";
import { gameConfig } from "../config/gameConfig";
import {
  hostPeerIdFor,
  validateRoomCode,
  type RandomBytes,
} from "../network/room/roomCode";
import { parseStart } from "../network/match/startMessage";
import {
  type LobbyMessage,
  type NetworkMessage,
} from "../network/protocol/messages";
import { validateLobbyEnvelope } from "../network/protocol/validate";
import {
  attachHandshakeClient,
  sendHello,
  type HandshakeOutcome,
} from "../network/session/HandshakeClient";
import { PeerTransport } from "../network/transport/PeerTransport";
import { lobbyStore, type LobbyPlayer } from "../store/lobbyStore";
import { isBotDifficulty, isGameMode } from "../types/game";
import type { LobbyConnection } from "./lobbyConnection";
import type { ClientStart } from "./networkMatchRunner";
import type { LobbyDeps } from "./sessionDeps";
import { SESSION_STATE, type SessionState } from "./sessionState";
import { arenaFromStart } from "./startArena";

const HELLO_TOKEN_LENGTH = 16;
const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export interface ClientLobbyContext {
  readonly lobbyDeps: LobbyDeps;
  getState(): SessionState;
  onFail(reason: string, detail?: string): void;
  onJoined(): void;
  onMatchStart(msg: NetworkMessage, localPid: number): void;
}

function createHelloToken(randomBytes: RandomBytes): string {
  return Array.from(randomBytes(HELLO_TOKEN_LENGTH), (byte) =>
    TOKEN_ALPHABET.charAt(byte % TOKEN_ALPHABET.length),
  ).join("");
}

export class ClientLobby {
  constructor(
    private readonly ctx: ClientLobbyContext,
    private readonly conn: LobbyConnection,
  ) {}

  join(code: string, name: string): boolean {
    debugLog("mp:client", "joinRoom");
    if (!validateRoomCode(code)) {
      lobbyStore.set({ status: "error", error: "Invalid room code" });
      return false;
    }
    const { peerFactory, randomBytes } = this.ctx.lobbyDeps;
    const hostPeerId = hostPeerIdFor(code);
    const transport = new PeerTransport({
      role: "client",
      hostPeerId,
      peerFactory,
    });
    const handshake = attachHandshakeClient(transport, hostPeerId);
    const token = createHelloToken(randomBytes);
    this.conn.transport = transport;
    this.conn.isHost = false;
    this.conn.handshake = handshake;
    this.conn.track(
      transport.onPeerChange((event) => {
        if (event.peerId !== hostPeerId) return;
        if (event.kind === "open") {
          sendHello(transport, name.trim(), token);
        } else if (
          event.kind === "close" &&
          this.ctx.getState() !== SESSION_STATE.idle
        ) {
          this.ctx.onFail("host-left");
        } else if (
          event.kind === "error" &&
          this.ctx.getState() === SESSION_STATE.joining
        ) {
          this.ctx.onFail("connect-error", event.detail);
        }
      }),
    );
    this.conn.track(
      handshake.onOutcome((outcome) => this.handleHandshakeOutcome(outcome)),
    );
    this.conn.track(
      transport.onMessage((msg: NetworkMessage, from) => {
        if (from === hostPeerId && msg.t === "lobby") {
          this.applyLobbyMessage(msg);
        }
      }),
    );
    this.conn.startConnectTimer(gameConfig.lobbyConnectTimeoutMs, () =>
      this.ctx.onFail("timeout"),
    );
    lobbyStore.set({
      role: "client",
      roomCode: code,
      status: "connecting",
      pid: null,
      players: [],
      bots: 0,
      error: null,
    });
    return true;
  }

  buildStart(
    msg: NetworkMessage,
    localPid: number,
    hasSurface: () => boolean,
  ): ClientStart | null {
    const parsed = parseStart(msg);
    const transport = this.conn.transport;
    debugLog(
      "mp:client",
      () =>
        `beginClientMatch parsed=${parsed.ok} transport=${transport !== null} surface=${hasSurface()}`,
    );
    if (!parsed.ok || transport === null) return null;
    return {
      start: msg,
      gameMode: parsed.value.gameMode,
      localPid,
      transport,
      hostPeerId: hostPeerIdFor(lobbyStore.getSnapshot().roomCode ?? ""),
      arena: arenaFromStart(parsed.value),
      names: new Map(parsed.value.names ?? []),
    };
  }

  private handleHandshakeOutcome(outcome: HandshakeOutcome): void {
    if (outcome.kind === "reject") {
      this.ctx.onFail(outcome.reason);
      return;
    }
    this.conn.clearConnectTimer();
    lobbyStore.set({ status: "ready", pid: outcome.pid, error: null });
    this.ctx.onJoined();
    this.listenForMatchStart(outcome.pid);
  }

  private listenForMatchStart(localPid: number): void {
    const transport = this.conn.transport;
    if (transport === null) return;
    this.conn.track(
      transport.onMessage((msg: NetworkMessage) => {
        if (msg.t !== "start") return;
        this.ctx.onMatchStart(msg, localPid);
      }),
    );
  }

  private applyLobbyMessage(msg: LobbyMessage): void {
    if (this.conn.isHost) return;
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
}
