import type {
  ChannelKind,
  PeerEvent,
  PeerId,
  PeerRole,
} from "../../types/network";
import { decodeMessage, encodeMessage } from "../protocol/codec";
import type { NetworkMessage } from "../protocol/messages";
import {
  createInvalidCounter,
  type InvalidCounter,
} from "../protocol/validate";
import type { HandshakeHost } from "../session/HandshakeHost";
import type { Transport, Unsubscribe } from "./Transport";

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

export type PeerTransportOptions =
  | {
      readonly role: "host";
      readonly peerId: PeerId;
      readonly peerFactory: PeerFactory;
      readonly now?: () => number;
      readonly handshake?: HandshakeHost;
    }
  | {
      readonly role: "client";
      readonly hostPeerId: PeerId;
      readonly peerFactory: PeerFactory;
      readonly now?: () => number;
    };

interface Slot {
  readonly conn: DataConnectionLike;
  isOpen: boolean;
}

interface Link {
  readonly peerId: PeerId;
  reliable: Slot | null;
  unreliable: Slot | null;
  isAnnounced: boolean;
}

type MessageHandler = (msg: NetworkMessage, fromPeerId: PeerId) => void;
type PeerHandler = (event: PeerEvent) => void;

const defaultNow = (): number => Date.now();

// PeerJS errors carry a machine-readable `type` (e.g. 'peer-unavailable'); fall back to the message.
function errorDetail(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }
  const { type, message } = value as { type?: unknown; message?: unknown };
  if (typeof type === "string" && type.length > 0) {
    return type;
  }
  return typeof message === "string" && message.length > 0
    ? message
    : undefined;
}

function parseRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// Each remote peer owns two connections: reliable (control and events) and unreliable (in, snap).
export class PeerTransport implements Transport {
  readonly role: PeerRole;
  readonly invalid: InvalidCounter = createInvalidCounter();
  private readonly peer: PeerLike;
  private readonly links = new Map<PeerId, Link>();
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly peerHandlers = new Set<PeerHandler>();
  private readonly now: () => number;
  private readonly anchorPeerId: PeerId;
  private readonly handshake: HandshakeHost | null;
  private isClosed = false;

  constructor(options: PeerTransportOptions) {
    this.role = options.role;
    this.now = options.now ?? defaultNow;
    if (options.role === "host") {
      this.anchorPeerId = options.peerId;
      this.handshake = options.handshake ?? null;
      this.peer = options.peerFactory(options.peerId);
      this.peer.on("connection", (value) =>
        this.handleIncoming(value as DataConnectionLike),
      );
    } else {
      this.anchorPeerId = options.hostPeerId;
      this.handshake = null;
      this.peer = options.peerFactory();
      this.peer.on("open", () => {
        if (!this.isClosed) {
          this.connectToHost(options.hostPeerId);
        }
      });
    }
    this.peer.on("error", (value) => this.emitError(this.anchorPeerId, value));
  }

  send(message: NetworkMessage, channel: ChannelKind): void {
    if (this.isClosed) {
      return;
    }
    const text = encodeMessage(message);
    for (const link of [...this.links.values()]) {
      const slot = channel === "reliable" ? link.reliable : link.unreliable;
      if (slot?.isOpen === true) {
        slot.conn.send(text);
      }
    }
  }

  sendTo(peerId: PeerId, message: NetworkMessage, channel: ChannelKind): void {
    const link = this.links.get(peerId);
    if (this.isClosed || link === undefined) {
      return;
    }
    const slot = channel === "reliable" ? link.reliable : link.unreliable;
    if (slot?.isOpen === true) {
      slot.conn.send(encodeMessage(message));
    }
  }

  onMessage(handler: MessageHandler): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onPeerChange(handler: PeerHandler): Unsubscribe {
    this.peerHandlers.add(handler);
    return () => {
      this.peerHandlers.delete(handler);
    };
  }

  close(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    for (const link of [...this.links.values()]) {
      this.dropLink(link);
    }
    this.peer.destroy();
  }

  private connectToHost(hostPeerId: PeerId): void {
    const link = this.createLink(hostPeerId);
    for (const reliable of [true, false]) {
      this.attach(
        link,
        this.peer.connect(hostPeerId, {
          reliable,
          serialization: PEER_SERIALIZATION,
        }),
      );
    }
  }

  private handleIncoming(conn: DataConnectionLike): void {
    if (this.isClosed) {
      conn.close();
      return;
    }
    const link = this.links.get(conn.peer) ?? this.createLink(conn.peer);
    const isSlotTaken = conn.reliable
      ? link.reliable !== null
      : link.unreliable !== null;
    if (isSlotTaken) {
      conn.close();
      return;
    }
    this.attach(link, conn);
  }

  private attach(link: Link, conn: DataConnectionLike): void {
    const slot: Slot = { conn, isOpen: false };
    if (conn.reliable) {
      link.reliable = slot;
    } else {
      link.unreliable = slot;
    }
    conn.on("open", () => this.handleOpen(link, slot));
    conn.on("data", (data) => this.handleData(link, data));
    conn.on("close", () => this.dropLink(link));
    conn.on("error", (value) => this.emitError(link.peerId, value));
  }

  // Announce on the reliable channel alone; the unreliable channel is optional for control traffic.
  private handleOpen(link: Link, slot: Slot): void {
    slot.isOpen = true;
    if (link.reliable?.isOpen !== true || link.isAnnounced) {
      return;
    }
    link.isAnnounced = true;
    this.emitPeer({ kind: "open", peerId: link.peerId });
  }

  private handleData(link: Link, data: unknown): void {
    if (this.isClosed) {
      return;
    }
    if (typeof data === "string" && this.tryHandshake(link, data)) {
      return;
    }
    const result = typeof data === "string" ? decodeMessage(data) : null;
    if (result === null || !result.ok) {
      this.rejectInbound(link.peerId);
      return;
    }
    for (const handler of this.messageHandlers) {
      handler(result.value, link.peerId);
    }
  }

  private tryHandshake(link: Link, text: string): boolean {
    if (this.handshake === null) {
      return false;
    }
    const raw = parseRecord(text);
    // Hello is handled before the strict decoder, which does not accept control messages from clients.
    if (raw?.t !== "hello") {
      return false;
    }
    const reply = this.handshake.onHello(link.peerId, raw);
    this.sendToLink(link, reply);
    if (reply.t === "reject") {
      this.dropLink(link);
    }
    return true;
  }

  private sendToLink(link: Link, message: NetworkMessage): void {
    if (link.reliable?.isOpen === true) {
      link.reliable.conn.send(encodeMessage(message));
    }
  }

  private rejectInbound(peerId: PeerId): void {
    const now = this.now();
    this.invalid.record(peerId, now);
    if (this.invalid.shouldDisconnect(peerId, now)) {
      const link = this.links.get(peerId);
      if (link !== undefined) {
        this.dropLink(link);
      }
    }
  }

  private createLink(peerId: PeerId): Link {
    const link: Link = {
      peerId,
      reliable: null,
      unreliable: null,
      isAnnounced: false,
    };
    this.links.set(peerId, link);
    return link;
  }

  private dropLink(link: Link): void {
    if (this.links.get(link.peerId) !== link) {
      return;
    }
    this.links.delete(link.peerId);
    this.handshake?.onDisconnect(link.peerId);
    for (const slot of [link.reliable, link.unreliable]) {
      slot?.conn.close();
    }
    if (link.isAnnounced) {
      this.emitPeer({ kind: "close", peerId: link.peerId });
    }
  }

  private emitError(peerId: PeerId, value: unknown): void {
    const detail = errorDetail(value);
    this.emitPeer(
      detail === undefined
        ? { kind: "error", peerId }
        : { kind: "error", peerId, detail },
    );
  }

  private emitPeer(event: PeerEvent): void {
    for (const handler of this.peerHandlers) {
      handler(event);
    }
  }
}
