import type { GameMode } from "../types/game";

export type LobbyRole = "host" | "client" | "none";
export type LobbyStatus = "idle" | "connecting" | "ready" | "error";

interface LobbyPlayer {
  readonly pid: number;
  readonly name: string;
}

export interface LobbySnapshot {
  readonly roomCode: string | null;
  readonly role: LobbyRole;
  readonly status: LobbyStatus;
  readonly pid: number | null;
  readonly players: readonly LobbyPlayer[];
  readonly bots: number;
  readonly gameMode: GameMode;
  readonly error: string | null;
}

type LobbyPatch = Partial<LobbySnapshot>;

export interface LobbyStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): LobbySnapshot;
  set(patch: LobbyPatch): void;
  reset(): void;
}

const EMPTY_LOBBY: LobbySnapshot = {
  roomCode: null,
  role: "none",
  status: "idle",
  pid: null,
  players: [],
  bots: 0,
  gameMode: "cash",
  error: null,
};

const REJECT_MESSAGES: ReadonlyMap<string, string> = new Map([
  ["version", "Version mismatch"],
  ["full", "Room is full"],
  ["invalid", "Invalid name"],
  ["running", "Match already running"],
  ["timeout", "Connection failed"],
  ["connect-error", "Connection error"],
  ["host-left", "Host left the room"],
]);

const PEER_ERROR_MESSAGES: ReadonlyMap<string, string> = new Map([
  ["peer-unavailable", "Room not found, check the code"],
  ["network", "Signaling server unreachable"],
  ["unavailable-id", "Room id in use, try again"],
]);

const DEFAULT_REJECT_MESSAGE = "Connection rejected";

export function reasonToMessage(reason: string): string {
  return REJECT_MESSAGES.get(reason) ?? DEFAULT_REJECT_MESSAGE;
}

export function peerErrorToMessage(detail: string | undefined): string {
  if (detail === undefined) {
    return reasonToMessage("connect-error");
  }
  return PEER_ERROR_MESSAGES.get(detail) ?? `Connection error: ${detail}`;
}

const CLIENT_WAITING_TEXT = "Waiting for host";

export function lobbyStatusText(snapshot: LobbySnapshot): string | null {
  if (snapshot.error !== null) return snapshot.error;
  if (snapshot.role === "client" && snapshot.status === "ready") {
    return CLIENT_WAITING_TEXT;
  }
  return null;
}

export function createLobbyStore(): LobbyStore {
  let snapshot = EMPTY_LOBBY;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): LobbySnapshot {
      return snapshot;
    },
    set(patch: LobbyPatch): void {
      snapshot = { ...snapshot, ...patch };
      notify();
    },
    reset(): void {
      snapshot = EMPTY_LOBBY;
      notify();
    },
  };
}

export const lobbyStore = createLobbyStore();
