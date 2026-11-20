// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/game/Renderer", () => ({
  createWorldRenderer: vi.fn(),
}));

import {
  SESSION_STATE,
  SessionController,
  type LobbyDeps,
} from "../../src/session/SessionController";
import { createHudStore } from "../../src/store/hudStore";
import { lobbyStore } from "../../src/store/lobbyStore";
import { gameConfig } from "../../src/config/gameConfig";
import { FakePeerHub } from "../network/transport/fakePeer";

interface FakeTimers {
  readonly timers: LobbyDeps["timers"];
  fireAll(): void;
  pendingCount(): number;
}

function createFakeTimers(): FakeTimers {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  return {
    timers: {
      setTimeout: (callback) => {
        const id = nextId++;
        pending.set(id, callback);
        return id;
      },
      clearTimeout: (handle) => {
        pending.delete(handle as number);
      },
    },
    fireAll() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
    },
    pendingCount: () => pending.size,
  };
}

function createController(
  hub: FakePeerHub,
  timers: LobbyDeps["timers"],
): SessionController {
  return new SessionController({
    createRenderer: vi.fn(),
    hud: createHudStore(),
    createAudio: () => ({ unlock: vi.fn(), dispose: vi.fn() }) as never,
    lobby: {
      peerFactory: hub.factory,
      timers,
    },
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SessionController lobby", () => {
  let hub: FakePeerHub;
  let fake: FakeTimers;

  beforeEach(() => {
    lobbyStore.reset();
    hub = new FakePeerHub();
    fake = createFakeTimers();
  });

  it("createRoom publishes a 6-character room code and host role", () => {
    const host = createController(hub, fake.timers);
    host.createRoom("Host");
    const snapshot = lobbyStore.getSnapshot();
    expect(snapshot.roomCode).toHaveLength(6);
    expect(snapshot).toMatchObject({
      role: "host",
      status: "ready",
      pid: 0,
      error: null,
      players: [{ pid: 0, name: "Host" }],
    });
    expect(host.getState()).toBe(SESSION_STATE.hostingLobby);
  });

  it("client joinRoom with the host code receives pid 1", async () => {
    const host = createController(hub, fake.timers);
    host.createRoom("Host");
    const code = lobbyStore.getSnapshot().roomCode ?? "";

    const client = createController(hub, fake.timers);
    client.joinRoom(code, "Ann");
    await flush();

    expect(client.getState()).toBe(SESSION_STATE.joinedLobby);
    expect(lobbyStore.getSnapshot()).toMatchObject({
      role: "client",
      status: "ready",
      pid: 1,
      error: null,
    });
    expect(fake.pendingCount()).toBe(0);
  });

  it("bad room code errors without touching the network", () => {
    const factory = vi.fn(hub.factory);
    const client = new SessionController({
      createRenderer: vi.fn(),
      hud: createHudStore(),
      createAudio: () => ({ unlock: vi.fn(), dispose: vi.fn() }) as never,
      lobby: { peerFactory: factory, timers: fake.timers },
    });
    client.joinRoom("bad", "Ann");
    expect(factory).not.toHaveBeenCalled();
    expect(client.getState()).toBe(SESSION_STATE.idle);
    expect(lobbyStore.getSnapshot()).toMatchObject({
      status: "error",
      error: "Invalid room code",
    });
  });

  it("unknown room code times out after lobbyConnectTimeoutMs", async () => {
    const client = createController(hub, fake.timers);
    client.joinRoom("ABCDEF", "Ann");
    await flush();
    expect(client.getState()).toBe(SESSION_STATE.joining);
    fake.fireAll();
    expect(client.getState()).toBe(SESSION_STATE.idle);
    expect(lobbyStore.getSnapshot()).toMatchObject({
      role: "none",
      status: "error",
      error: "Connection failed",
    });
    expect(gameConfig.lobbyConnectTimeoutMs).toBe(10000);
  });

  it("rejects a fourth client with 'Room is full'", async () => {
    const host = createController(hub, fake.timers);
    host.createRoom("Host");
    const code = lobbyStore.getSnapshot().roomCode ?? "";

    for (let index = 0; index < 3; index += 1) {
      createController(hub, fake.timers).joinRoom(code, `P${index}`);
      await flush();
    }
    expect(lobbyStore.getSnapshot().pid).toBe(3);

    const late = createController(hub, fake.timers);
    late.joinRoom(code, "Late");
    await flush();
    expect(late.getState()).toBe(SESSION_STATE.idle);
    expect(lobbyStore.getSnapshot()).toMatchObject({
      status: "error",
      error: "Room is full",
    });
  });

  it("peer-unavailable during joinRoom reports 'Room not found' without waiting for timeout", async () => {
    const client = createController(hub, fake.timers);
    client.joinRoom("ABCDEF", "Ann");
    const clientId = hub.peerIds().at(-1) ?? "";
    hub.peer(clientId)?.emit("error", { type: "peer-unavailable" });

    expect(client.getState()).toBe(SESSION_STATE.idle);
    expect(fake.pendingCount()).toBe(0);
    expect(lobbyStore.getSnapshot()).toMatchObject({
      role: "none",
      status: "error",
      error: "Room not found, check the code",
    });
    await flush();
    expect(hub.connections).toEqual([]);
  });

  it("backToIdle closes the lobby transport and resets the store", async () => {
    const host = createController(hub, fake.timers);
    host.createRoom("Host");
    host.backToIdle();
    expect(host.getState()).toBe(SESSION_STATE.idle);
    expect(lobbyStore.getSnapshot()).toMatchObject({
      roomCode: null,
      role: "none",
      status: "idle",
    });
    expect(hub.peerIds().filter((id) => id.startsWith("asph-"))).toEqual([]);
  });
});
