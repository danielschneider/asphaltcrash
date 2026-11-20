import type { PeerId } from "../../types/network";
import {
  PROTOCOL_VERSION,
  type RejectMessage,
  type WelcomeMessage,
} from "../protocol/messages";
import { validateHello } from "../protocol/validate";

export interface HandshakeHostOptions {
  readonly maxClients?: number;
}

const DEFAULT_MAX_CLIENTS = 3;
const HOST_SLOT = 0;

type HandshakeReply = WelcomeMessage | RejectMessage;

export class HandshakeHost {
  private readonly maxClients: number;
  private readonly slotByPeer = new Map<PeerId, number>();

  constructor(options: HandshakeHostOptions = {}) {
    this.maxClients = options.maxClients ?? DEFAULT_MAX_CLIENTS;
  }

  onHello(peerId: PeerId, rawHello: unknown): HandshakeReply {
    if (isRecordWithVersion(rawHello) && rawHello.v !== PROTOCOL_VERSION) {
      return reject("version");
    }
    if (!validateHello(rawHello).ok) {
      return reject("invalid");
    }
    const existing = this.slotByPeer.get(peerId);
    if (existing !== undefined) {
      return welcome(existing);
    }
    const slot = this.findFreeSlot();
    if (slot === null) {
      return reject("full");
    }
    this.slotByPeer.set(peerId, slot);
    return welcome(slot);
  }

  onDisconnect(peerId: PeerId): void {
    this.slotByPeer.delete(peerId);
  }

  private findFreeSlot(): number | null {
    const taken = new Set(this.slotByPeer.values());
    for (let slot = HOST_SLOT + 1; slot <= this.maxClients; slot += 1) {
      if (!taken.has(slot)) {
        return slot;
      }
    }
    return null;
  }
}

function isRecordWithVersion(raw: unknown): raw is { readonly v: unknown } {
  return typeof raw === "object" && raw !== null && "v" in raw;
}

function welcome(pid: number): WelcomeMessage {
  return {
    v: PROTOCOL_VERSION,
    t: "welcome",
    pid,
    lobby: { players: [], bots: 0, cfg: {} },
  };
}

function reject(reason: RejectMessage["reason"]): RejectMessage {
  return { v: PROTOCOL_VERSION, t: "reject", reason };
}
