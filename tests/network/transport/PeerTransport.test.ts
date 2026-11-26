import { describe, expect, it } from "vitest";
import { PeerTransport } from "../../../src/network/transport/PeerTransport";
import type { InputMessage } from "../../../src/network/protocol/messages";
import type { PeerEvent } from "../../../src/types/network";
import { FakePeerHub } from "./fakePeer";

const HOST_ID = "asph-ABCDEF";

const inputMessage: InputMessage = {
  v: 1,
  t: "in",
  s: 1,
  ax: 100,
  ay: -50,
  a: 1,
};

const timerEvent = {
  v: 1,
  t: "ev",
  k: "timer",
  d: [30000],
} as const;

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function connectPair(): {
  hub: FakePeerHub;
  host: PeerTransport;
  client: PeerTransport;
  clientId: string;
} {
  const hub = new FakePeerHub();
  const host = new PeerTransport({
    role: "host",
    peerId: HOST_ID,
    peerFactory: hub.factory,
  });
  const client = new PeerTransport({
    role: "client",
    hostPeerId: HOST_ID,
    peerFactory: hub.factory,
  });
  const clientId = hub.peerIds().find((id) => id !== HOST_ID) ?? "";
  return { hub, host, client, clientId };
}

describe("PeerTransport", () => {
  it("sendTo reaches only the target peer in a 3-peer hub", async () => {
    const hub = new FakePeerHub();
    const host = new PeerTransport({
      role: "host",
      peerId: HOST_ID,
      peerFactory: hub.factory,
    });
    const clientA = new PeerTransport({
      role: "client",
      hostPeerId: HOST_ID,
      peerFactory: hub.factory,
    });
    const clientB = new PeerTransport({
      role: "client",
      hostPeerId: HOST_ID,
      peerFactory: hub.factory,
    });
    await flush();
    const [idA] = hub.peerIds().filter((id) => id !== HOST_ID);
    const inboxA: unknown[] = [];
    const inboxB: unknown[] = [];
    clientA.onMessage((msg) => inboxA.push(msg));
    clientB.onMessage((msg) => inboxB.push(msg));

    host.sendTo(idA ?? "", timerEvent, "reliable");

    expect(inboxA).toEqual([timerEvent]);
    expect(inboxB).toEqual([]);
    expect(hub.sentOn(HOST_ID, true)).toHaveLength(1);
  });

  it("sendTo ignores unknown peers", async () => {
    const { host, client } = connectPair();
    let calls = 0;
    client.onMessage(() => {
      calls += 1;
    });
    await flush();
    host.sendTo("nobody", timerEvent, "reliable");
    expect(calls).toBe(0);
  });

  it("exposes its role", () => {
    const { host, client } = connectPair();
    expect(host.role).toBe("host");
    expect(client.role).toBe("client");
  });

  it("delivers messages from client to host and back", async () => {
    const { host, client, clientId } = connectPair();
    const hostInbox: Array<{ msg: unknown; from: string }> = [];
    const clientInbox: Array<{ msg: unknown; from: string }> = [];
    host.onMessage((msg, from) => hostInbox.push({ msg, from }));
    client.onMessage((msg, from) => clientInbox.push({ msg, from }));
    await flush();

    client.send(inputMessage, "unreliable");
    host.send(timerEvent, "reliable");

    expect(hostInbox).toEqual([{ msg: inputMessage, from: clientId }]);
    expect(clientInbox).toEqual([{ msg: timerEvent, from: HOST_ID }]);
  });

  it("routes reliable and unreliable sends to matching connections", async () => {
    const { hub, host, client, clientId } = connectPair();
    await flush();

    client.send(timerEvent, "reliable");
    client.send(inputMessage, "unreliable");
    host.send(timerEvent, "reliable");

    expect(hub.sentOn(clientId, true)).toHaveLength(1);
    expect(hub.sentOn(clientId, false)).toHaveLength(1);
    expect(hub.sentOn(HOST_ID, true)).toHaveLength(1);
    expect(hub.sentOn(HOST_ID, false)).toHaveLength(0);
  });

  it("counts and drops invalid JSON without throwing", async () => {
    const { hub, host, clientId } = connectPair();
    let calls = 0;
    host.onMessage(() => {
      calls += 1;
    });
    await flush();

    const unreliable = hub.connections.find(
      (c) => c.owner === clientId && !c.reliable,
    );
    expect(() => unreliable?.sendRaw("{broken")).not.toThrow();

    expect(calls).toBe(0);
    expect(host.invalid.count(clientId)).toBe(1);
  });

  it("drops messages with an unknown type", async () => {
    const { hub, host, clientId } = connectPair();
    let calls = 0;
    host.onMessage(() => {
      calls += 1;
    });
    await flush();

    const reliable = hub.connections.find(
      (c) => c.owner === clientId && c.reliable,
    );
    reliable?.sendRaw('{"v":1,"t":"bogus"}');

    expect(calls).toBe(0);
    expect(host.invalid.count(clientId)).toBe(1);
  });

  it("accepts three pings within 5 s without counting them as invalid", async () => {
    const { host, client, clientId } = connectPair();
    const hostInbox: unknown[] = [];
    host.onMessage((msg) => hostInbox.push(msg));
    await flush();

    for (let i = 0; i < 3; i += 1) {
      client.send({ v: 1, t: "ping", c: 1000 + i }, "reliable");
    }

    expect(hostInbox).toHaveLength(3);
    expect(host.invalid.count(clientId)).toBe(0);
  });

  it("emits open on both sides once the reliable channel is open", async () => {
    const { host, client, clientId } = connectPair();
    const hostEvents: PeerEvent[] = [];
    const clientEvents: PeerEvent[] = [];
    host.onPeerChange((event) => hostEvents.push(event));
    client.onPeerChange((event) => clientEvents.push(event));
    await flush();

    expect(hostEvents).toEqual([{ kind: "open", peerId: clientId }]);
    expect(clientEvents).toEqual([{ kind: "open", peerId: HOST_ID }]);
  });

  it("emits close when the client closes and stops delivering", async () => {
    const { host, client, clientId } = connectPair();
    const hostEvents: PeerEvent[] = [];
    let calls = 0;
    host.onPeerChange((event) => hostEvents.push(event));
    host.onMessage(() => {
      calls += 1;
    });
    await flush();

    client.close();
    client.send(inputMessage, "reliable");

    expect(hostEvents).toContainEqual({ kind: "close", peerId: clientId });
    expect(calls).toBe(0);
  });

  it("unsubscribes handlers when the returned function is called", async () => {
    const { host, client } = connectPair();
    let calls = 0;
    const unsubscribe = host.onMessage(() => {
      calls += 1;
    });
    await flush();
    unsubscribe();

    client.send(inputMessage, "unreliable");

    expect(calls).toBe(0);
  });

  it("close() is idempotent and closes the host peer", async () => {
    const { hub, host } = connectPair();
    await flush();
    host.close();
    host.close();

    expect(hub.peer(HOST_ID)).toBeUndefined();
  });

  it("client does not connect before the local peer emits open", async () => {
    const hub = new FakePeerHub(false);
    const host = new PeerTransport({
      role: "host",
      peerId: HOST_ID,
      peerFactory: hub.factory,
    });
    const client = new PeerTransport({
      role: "client",
      hostPeerId: HOST_ID,
      peerFactory: hub.factory,
    });
    const clientId = hub.peerIds().find((id) => id !== HOST_ID) ?? "";
    const clientEvents: PeerEvent[] = [];
    client.onPeerChange((event) => clientEvents.push(event));
    await flush();

    expect(host.role).toBe("host");
    expect(hub.peer(clientId)?.connectCalls).toBe(0);
    expect(clientEvents).toEqual([]);

    hub.open(clientId);
    await flush();

    expect(hub.peer(clientId)?.connectCalls).toBe(2);
    expect(clientEvents).toEqual([{ kind: "open", peerId: HOST_ID }]);
  });

  it("reports a peer error with its PeerJS type as detail", () => {
    const hub = new FakePeerHub();
    const client = new PeerTransport({
      role: "client",
      hostPeerId: HOST_ID,
      peerFactory: hub.factory,
    });
    const clientId = hub.peerIds().find((id) => id !== HOST_ID) ?? "";
    const clientEvents: PeerEvent[] = [];
    client.onPeerChange((event) => clientEvents.push(event));

    hub.peer(clientId)?.emit("error", {
      type: "unavailable-id",
      message: "ID is taken",
    });

    expect(clientEvents).toEqual([
      { kind: "error", peerId: HOST_ID, detail: "unavailable-id" },
    ]);
  });

  it("reports a connection error with its message when no type is set", async () => {
    const hub = new FakePeerHub();
    const { host, clientId } = createHostAndClient(hub);
    const hostEvents: PeerEvent[] = [];
    host.onPeerChange((event) => hostEvents.push(event));
    await flush();

    const hostSide = hub.connections.find(
      (c) => c.owner === HOST_ID && c.peer === clientId && c.reliable,
    );
    hostSide?.emit("error", new Error("ICE failed"));

    expect(hostEvents).toContainEqual({
      kind: "error",
      peerId: clientId,
      detail: "ICE failed",
    });
  });
});

function createHostAndClient(hub: FakePeerHub): {
  host: PeerTransport;
  client: PeerTransport;
  clientId: string;
} {
  const host = new PeerTransport({
    role: "host",
    peerId: HOST_ID,
    peerFactory: hub.factory,
  });
  const client = new PeerTransport({
    role: "client",
    hostPeerId: HOST_ID,
    peerFactory: hub.factory,
  });
  const clientId = hub.peerIds().find((id) => id !== HOST_ID) ?? "";
  return { host, client, clientId };
}
