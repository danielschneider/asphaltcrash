import { createRng, type Rng } from "../../game/sim/Rng";
import type { ChannelKind, PeerEvent, PeerId } from "../../types/network";
import { decodeMessage, encodeMessage } from "../protocol/codec";
import type { NetworkMessage } from "../protocol/messages";
import {
  createInvalidCounter,
  type InvalidCounter,
} from "../protocol/validate";
import type { Transport, Unsubscribe } from "./Transport";

export interface LocalPairOptions {
  readonly dropRate?: number;
  readonly seed?: number;
  readonly now?: () => number;
}

export interface LocalTransportStats {
  readonly sent: number;
  readonly dropped: number;
  readonly received: number;
  readonly decodeFailures: number;
}

export interface LocalTransportHandle {
  readonly transport: LocalTransport;
  readonly stats: () => LocalTransportStats;
  readonly invalid: InvalidCounter;
  sendRaw(text: string, channel: ChannelKind): void;
}

type MessageHandler = (msg: NetworkMessage, fromPeerId: PeerId) => void;
type PeerHandler = (event: PeerEvent) => void;

interface ResolvedLocalOptions {
  readonly dropRate: number;
  readonly seed: number;
  readonly now: () => number;
}

const LOCAL_PEER_IDS = ["local-a", "local-b"] as const;

// Synchronous immediate dispatch: send() encodes, the receiver decodes and validates, then handlers run inline.
export class LocalTransport implements Transport {
  readonly role = "local" as const;
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly peerHandlers = new Set<PeerHandler>();
  private peer: LocalTransport | null = null;
  private readonly selfId: PeerId;
  private readonly rng: Rng;
  private readonly dropRate: number;
  private readonly invalidCounter: InvalidCounter;
  private readonly now: () => number;
  private counters = { sent: 0, dropped: 0, received: 0, decodeFailures: 0 };
  private isClosed = false;

  constructor(selfId: PeerId, options: ResolvedLocalOptions) {
    this.selfId = selfId;
    this.rng = createRng(options.seed);
    this.dropRate = options.dropRate;
    this.invalidCounter = createInvalidCounter();
    this.now = options.now;
  }

  connect(peer: LocalTransport): void {
    this.peer = peer;
    this.emitPeer({ kind: "open", peerId: peer.selfId });
  }

  get peerId(): PeerId {
    return this.selfId;
  }

  get invalid(): InvalidCounter {
    return this.invalidCounter;
  }

  get stats(): LocalTransportStats {
    return { ...this.counters };
  }

  send(message: NetworkMessage, channel: ChannelKind): void {
    this.transmit(encodeMessage(message), channel);
  }

  sendTo(peerId: PeerId, message: NetworkMessage, channel: ChannelKind): void {
    if (this.peer?.selfId !== peerId) {
      return;
    }
    this.transmit(encodeMessage(message), channel);
  }

  sendRaw(text: string, channel: ChannelKind): void {
    this.transmit(text, channel);
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
    const other = this.peer;
    this.peer = null;
    this.emitPeer({ kind: "close", peerId: other?.selfId ?? this.selfId });
    other?.handleRemoteClose(this.selfId);
  }

  private handleRemoteClose(remoteId: PeerId): void {
    this.peer = null;
    this.emitPeer({ kind: "close", peerId: remoteId });
  }

  private transmit(text: string, channel: ChannelKind): void {
    this.counters.sent += 1;
    const target = this.peer;
    if (this.isClosed || target === null) {
      return;
    }
    if (
      channel === "unreliable" &&
      this.dropRate > 0 &&
      this.rng.next() < this.dropRate
    ) {
      this.counters.dropped += 1;
      return;
    }
    target.receive(text, this.selfId);
  }

  private receive(text: string, fromId: PeerId): void {
    const result = decodeMessage(text);
    if (!result.ok) {
      this.counters.decodeFailures += 1;
      this.invalidCounter.record(fromId, this.now());
      return;
    }
    this.counters.received += 1;
    for (const handler of this.messageHandlers) {
      handler(result.value, fromId);
    }
  }

  private emitPeer(event: PeerEvent): void {
    for (const handler of this.peerHandlers) {
      handler(event);
    }
  }
}

export function createLocalPair(
  options: LocalPairOptions = {},
): [LocalTransportHandle, LocalTransportHandle] {
  const resolved = {
    dropRate: options.dropRate ?? 0,
    seed: options.seed ?? 1,
    now: options.now ?? (() => 0),
  };
  const [idA, idB] = LOCAL_PEER_IDS;
  const a = new LocalTransport(idA, resolved);
  const b = new LocalTransport(idB, resolved);
  a.connect(b);
  b.connect(a);
  return [toHandle(a), toHandle(b)];
}

function toHandle(transport: LocalTransport): LocalTransportHandle {
  return {
    transport,
    stats: () => transport.stats,
    invalid: transport.invalid,
    sendRaw: (text, channel) => transport.sendRaw(text, channel),
  };
}
