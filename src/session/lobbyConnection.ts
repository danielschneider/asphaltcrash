import type { PeerTransport } from "../network/transport/PeerTransport";
import type { Unsubscribe } from "../network/transport/Transport";
import type { HandshakeClient } from "../network/session/HandshakeClient";
import type { RosterHandshakeHost } from "../network/session/RosterHandshakeHost";
import { peerErrorToMessage, reasonToMessage } from "../store/lobbyStore";
import type { LobbyTimers } from "./sessionDeps";

export function lobbyErrorMessage(reason: string, detail?: string): string {
  return reason === "connect-error"
    ? peerErrorToMessage(detail)
    : reasonToMessage(reason);
}

export class LobbyConnection {
  transport: PeerTransport | null = null;
  isHost = false;
  handshake: HandshakeClient | null = null;
  roster: RosterHandshakeHost | null = null;
  private unsubscribers: Unsubscribe[] = [];
  private connectTimer: unknown = null;

  constructor(private readonly timers: LobbyTimers) {}

  track(unsubscribe: Unsubscribe): void {
    this.unsubscribers.push(unsubscribe);
  }

  startConnectTimer(ms: number, onTimeout: () => void): void {
    this.connectTimer = this.timers.setTimeout(() => {
      this.connectTimer = null;
      onTimeout();
    }, ms);
  }

  clearConnectTimer(): void {
    if (this.connectTimer === null) return;
    this.timers.clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  teardown(): void {
    this.clearConnectTimer();
    this.isHost = false;
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    this.handshake?.dispose();
    this.handshake = null;
    this.transport?.close();
    this.transport = null;
    this.roster = null;
  }
}
