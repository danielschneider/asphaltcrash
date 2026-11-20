import type {
  ConnectOptions,
  DataConnectionLike,
  PeerFactory,
  PeerLike,
} from "../../../src/network/transport/PeerTransport";
import type { PeerId } from "../../../src/types/network";

type Handler = (value?: unknown) => void;
type HandlerMap = Map<string, Handler[]>;

function addHandler(map: HandlerMap, event: string, handler: Handler): void {
  const list = map.get(event) ?? [];
  list.push(handler);
  map.set(event, list);
}

function dispatch(map: HandlerMap, event: string, value?: unknown): void {
  for (const handler of map.get(event) ?? []) {
    handler(value);
  }
}

export class FakeDataConnection implements DataConnectionLike {
  readonly sent: string[] = [];
  partner: FakeDataConnection | null = null;
  private readonly handlers: HandlerMap = new Map();
  private isClosed = false;

  constructor(
    readonly owner: PeerId,
    readonly peer: PeerId,
    readonly reliable: boolean,
  ) {}

  on(event: string, handler: Handler): void {
    addHandler(this.handlers, event, handler);
  }

  send(data: string): void {
    if (this.isClosed || this.partner === null) {
      return;
    }
    this.sent.push(data);
    this.partner.emit("data", data);
  }

  sendRaw(data: unknown): void {
    this.partner?.emit("data", data);
  }

  close(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    this.emit("close");
    this.partner?.close();
  }

  open(): void {
    if (!this.isClosed) {
      this.emit("open");
    }
  }

  emit(event: string, value?: unknown): void {
    dispatch(this.handlers, event, value);
  }
}

export class FakePeer implements PeerLike {
  private readonly handlers: HandlerMap = new Map();
  connectCalls = 0;

  constructor(
    readonly id: PeerId,
    private readonly hub: FakePeerHub,
  ) {}

  on(event: string, handler: Handler): void {
    addHandler(this.handlers, event, handler);
  }

  connect(peerId: PeerId, options: ConnectOptions): DataConnectionLike {
    this.connectCalls += 1;
    const local = this.hub.createConnection(this.id, peerId, options.reliable);
    const remote = this.hub.createConnection(peerId, this.id, options.reliable);
    local.partner = remote;
    remote.partner = local;
    const target = this.hub.peer(peerId);
    // Unknown target: the connection never opens (no error), so callers observe only their own timeout.
    if (target === undefined) {
      return local;
    }
    target.emit("connection", remote);
    queueMicrotask(() => {
      remote.open();
      local.open();
    });
    return local;
  }

  destroy(): void {
    this.hub.unregister(this.id);
    dispatch(this.handlers, "close");
  }

  emit(event: string, value?: unknown): void {
    dispatch(this.handlers, event, value);
  }
}

// In-memory PeerJS stand-in: peers are paired by id, connections open on the next microtask.
// With autoOpen=false a peer stays unopened until open() is called, as a real Peer does while signaling.
export class FakePeerHub {
  readonly connections: FakeDataConnection[] = [];
  private readonly peers = new Map<PeerId, FakePeer>();
  private nextClientNumber = 1;

  constructor(private readonly autoOpen = true) {}

  readonly factory: PeerFactory = (id?: PeerId): PeerLike => {
    const peerId = id ?? `client-${this.nextClientNumber++}`;
    const peer = new FakePeer(peerId, this);
    this.peers.set(peerId, peer);
    if (this.autoOpen) {
      queueMicrotask(() => peer.emit("open"));
    }
    return peer;
  };

  open(id: PeerId): void {
    this.peer(id)?.emit("open");
  }

  peer(id: PeerId): FakePeer | undefined {
    return this.peers.get(id);
  }

  peerIds(): PeerId[] {
    return [...this.peers.keys()];
  }

  unregister(id: PeerId): void {
    this.peers.delete(id);
  }

  createConnection(
    owner: PeerId,
    peer: PeerId,
    reliable: boolean,
  ): FakeDataConnection {
    const conn = new FakeDataConnection(owner, peer, reliable);
    this.connections.push(conn);
    return conn;
  }

  sentOn(owner: PeerId, reliable: boolean): string[] {
    return this.connections
      .filter((c) => c.owner === owner && c.reliable === reliable)
      .flatMap((c) => c.sent);
  }
}
