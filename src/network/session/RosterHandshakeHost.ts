import { gameConfig } from "../../config/gameConfig";
import type { PeerId } from "../../types/network";
import { validateHello } from "../protocol/validate";
import { HandshakeHost } from "./HandshakeHost";

interface RosterEntry {
  readonly pid: number;
  readonly name: string;
}

export type NameGenerator = (taken: ReadonlySet<string>) => string;

type HandshakeReply = ReturnType<HandshakeHost["onHello"]>;

const NAME_PLACEHOLDER = "Name";

// Publishes the roster (host entry first) whenever a client joins or leaves.
// A hello whose only defect is the name gets a generated unique name instead of a rejection.
export class RosterHandshakeHost extends HandshakeHost {
  private readonly entries = new Map<PeerId, RosterEntry>();
  private readonly hostEntry: RosterEntry;
  private readonly onChange: (players: readonly RosterEntry[]) => void;
  private readonly generateName: NameGenerator;

  constructor(
    hostEntry: RosterEntry,
    onChange: (players: readonly RosterEntry[]) => void,
    generateName: NameGenerator,
  ) {
    super({ maxClients: gameConfig.maxHumans - 1 });
    this.hostEntry = hostEntry;
    this.onChange = onChange;
    this.generateName = generateName;
  }

  override onHello(peerId: PeerId, rawHello: unknown): HandshakeReply {
    const hello = this.resolveHello(peerId, rawHello);
    const reply = super.onHello(peerId, hello);
    if (reply.t === "welcome") {
      this.entries.set(peerId, {
        pid: reply.pid,
        name: readHelloName(hello),
      });
      this.publish();
    }
    return reply;
  }

  override onDisconnect(peerId: PeerId): void {
    super.onDisconnect(peerId);
    if (this.entries.delete(peerId)) {
      this.publish();
    }
  }

  pidForPeer(peerId: PeerId): number | undefined {
    return this.entries.get(peerId)?.pid;
  }

  peerIdForPid(pid: number): PeerId | undefined {
    for (const [peerId, entry] of this.entries) {
      if (entry.pid === pid) return peerId;
    }
    return undefined;
  }

  private resolveHello(peerId: PeerId, rawHello: unknown): unknown {
    if (validateHello(rawHello).ok || !isRecord(rawHello)) return rawHello;
    const nameOnlyDefect = validateHello({
      ...rawHello,
      name: NAME_PLACEHOLDER,
    }).ok;
    if (!nameOnlyDefect) return rawHello;
    return { ...rawHello, name: this.generateName(this.takenNames(peerId)) };
  }

  private takenNames(exceptPeerId: PeerId): Set<string> {
    const names = new Set<string>([this.hostEntry.name]);
    for (const [peerId, entry] of this.entries) {
      if (peerId !== exceptPeerId) names.add(entry.name);
    }
    return names;
  }

  private publish(): void {
    this.onChange([this.hostEntry, ...this.entries.values()]);
  }
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function readHelloName(raw: unknown): string {
  if (!isRecord(raw)) return "";
  return typeof raw.name === "string" ? raw.name.trim() : "";
}
