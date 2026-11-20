import { describe, expect, it } from "vitest";
import { PeerTransport } from "../../../src/network/transport/PeerTransport";
import { HandshakeHost } from "../../../src/network/session/HandshakeHost";
import {
  attachHandshakeClient,
  sendHello,
  type HandshakeOutcome,
} from "../../../src/network/session/HandshakeClient";
import { FakePeerHub } from "../transport/fakePeer";

const HOST_ID = "asph-ABCDEF";
const TOKEN = "abcdefghij123456";

function hello(overrides: Record<string, unknown> = {}): unknown {
  return { v: 1, t: "hello", name: "Ann", token: TOKEN, ...overrides };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function startHost(maxClients = 3): { hub: FakePeerHub; host: PeerTransport } {
  const hub = new FakePeerHub();
  const host = new PeerTransport({
    role: "host",
    peerId: HOST_ID,
    peerFactory: hub.factory,
    handshake: new HandshakeHost({ maxClients }),
  });
  return { hub, host };
}

async function connectClient(
  hub: FakePeerHub,
  name = "Ann",
): Promise<{ client: PeerTransport; outcome: () => HandshakeOutcome | null }> {
  const client = new PeerTransport({
    role: "client",
    hostPeerId: HOST_ID,
    peerFactory: hub.factory,
  });
  const handshake = attachHandshakeClient(client, HOST_ID);
  await flush();
  sendHello(client, name, TOKEN);
  return { client, outcome: () => handshake.outcome() };
}

describe("HandshakeHost", () => {
  it("assigns pids 1 then 2 to distinct peers", () => {
    const host = new HandshakeHost();
    expect(host.onHello("a", hello())).toEqual({
      v: 1,
      t: "welcome",
      pid: 1,
      lobby: { players: [], bots: 0, cfg: {} },
    });
    expect(host.onHello("b", hello())).toMatchObject({ t: "welcome", pid: 2 });
  });

  it("rejects the fourth client with full when maxClients is 3", () => {
    const host = new HandshakeHost({ maxClients: 3 });
    for (const id of ["a", "b", "c"]) host.onHello(id, hello());
    expect(host.onHello("d", hello())).toEqual({
      v: 1,
      t: "reject",
      reason: "full",
    });
  });

  it("rejects a wrong protocol version with version", () => {
    expect(new HandshakeHost().onHello("a", hello({ v: 2 }))).toEqual({
      v: 1,
      t: "reject",
      reason: "version",
    });
  });

  it("rejects an invalid name or token with invalid", () => {
    const host = new HandshakeHost();
    expect(host.onHello("a", hello({ name: "   " }))).toMatchObject({
      t: "reject",
      reason: "invalid",
    });
    expect(host.onHello("a", hello({ token: "short" }))).toMatchObject({
      reason: "invalid",
    });
    expect(host.onHello("a", "not an object")).toMatchObject({
      reason: "invalid",
    });
  });

  it("frees the slot on disconnect so a new peer takes it", () => {
    const host = new HandshakeHost({ maxClients: 1 });
    host.onHello("a", hello());
    expect(host.onHello("b", hello())).toMatchObject({ reason: "full" });
    host.onDisconnect("a");
    expect(host.onHello("b", hello())).toMatchObject({ t: "welcome", pid: 1 });
  });
});

describe("handshake over fake PeerJS transport", () => {
  it("welcomes the first and second client with pid 1 and 2", async () => {
    const { hub } = startHost();
    await flush();
    const first = await connectClient(hub);
    const second = await connectClient(hub);

    expect(first.outcome()).toEqual({ kind: "welcome", pid: 1 });
    expect(second.outcome()).toEqual({ kind: "welcome", pid: 2 });
  });

  it("rejects a fourth client with full", async () => {
    const { hub } = startHost(3);
    await flush();
    for (let i = 0; i < 3; i += 1) await connectClient(hub);
    const fourth = await connectClient(hub);

    expect(fourth.outcome()).toEqual({ kind: "reject", reason: "full" });
  });

  it("gives a freed slot to a new client after a disconnect", async () => {
    const { hub } = startHost(1);
    await flush();
    const first = await connectClient(hub);
    expect(first.outcome()).toEqual({ kind: "welcome", pid: 1 });

    first.client.close();
    const next = await connectClient(hub);

    expect(next.outcome()).toEqual({ kind: "welcome", pid: 1 });
  });

  it("rejects an invalid name end to end", async () => {
    const { hub } = startHost();
    await flush();
    const bad = await connectClient(hub, "   ");

    expect(bad.outcome()).toEqual({ kind: "reject", reason: "invalid" });
  });
});
