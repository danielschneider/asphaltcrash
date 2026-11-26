import type { PeerId } from "../../types/network";

export const PEER_SERIALIZATION = "json";

export interface ConnectOptions {
  readonly reliable: boolean;
  readonly serialization: string;
}

export type ConnectionEventName = "open" | "data" | "close" | "error";
export type PeerEventName = "open" | "connection" | "error" | "close";

export interface DataConnectionLike {
  readonly peer: PeerId;
  readonly reliable: boolean;
  send(data: string): void;
  close(): void;
  on(event: ConnectionEventName, handler: (value?: unknown) => void): void;
}

export interface PeerLike {
  on(event: PeerEventName, handler: (value?: unknown) => void): void;
  connect(peerId: PeerId, options: ConnectOptions): DataConnectionLike;
  destroy(): void;
}

export type PeerFactory = (id?: PeerId) => PeerLike;
