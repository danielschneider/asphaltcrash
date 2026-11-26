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
import { hostPeerIdFor } from "../../src/network/room/roomCode";
import { FakePeerHub } from "../network/transport/fakePeer";

interface ManualTimers {
  readonly timers: LobbyDeps["timers"];
  readonly pending: () => number;
  fireAll(): void;
}

function createManualTimers(): ManualTimers {
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
    pending: () => pending.size,
    fireAll() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
    },
  };
}

function createController(
  hub: FakePeerHub,
  timers: LobbyDeps["timers"],
  randomBytes?: LobbyDeps["randomBytes"],
): SessionController {
  return new SessionController({
    createRenderer: vi.fn(),
    hud: createHudStore(),
    createAudio: () => ({ unlock: vi.fn(), dispose: vi.fn() }) as never,
    requestFrame: () => 0,
    cancelFrame: () => undefined,
    lobby: {
      peerFactory: hub.factory,
      timers,
      ...(randomBytes ? { randomBytes } : {}),
    },
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function roomCode(): string {
  return lobbyStore.getSnapshot().roomCode ?? "";
}

describe("SessionController host lobby", () => {
  let hub: FakePeerHub;
  let timers: ManualTimers;

  beforeEach(() => {
    lobbyStore.reset();
    hub = new FakePeerHub();
    timers = createManualTimers();
  });

  it("createRoom publishes the store contents for a fresh host", () => {
    const host = createController(hub, timers.timers);
    host.createRoom("  Boss  ");
    expect(lobbyStore.getSnapshot()).toMatchObject({
      role: "host",
      status: "ready",
      pid: 0,
      error: null,
      players: [{ pid: 0, name: "Boss" }],
      bots: gameConfig.botDefaultCount,
      gameMode: "crashfest",
      botDifficulty: "normal",
    });
    expect(lobbyStore.getSnapshot().roomCode).toHaveLength(6);
    expect(host.getState()).toBe(SESSION_STATE.hostingLobby);
  });

  it("createRoom with a blank name generates a player name", () => {
    const host = createController(hub, timers.timers);
    host.createRoom("   ");
    const [hostRow] = lobbyStore.getSnapshot().players;
    expect(hostRow?.pid).toBe(0);
    expect(hostRow?.name.trim().length).toBeGreaterThan(0);
  });

  it("createRoom throws and stays idle when the random source yields no usable bytes", () => {
    const host = createController(hub, timers.timers, () => new Uint8Array(0));
    expect(() => host.createRoom("Host")).toThrow(
      "room code generation exhausted its byte batches",
    );
    expect(host.getState()).toBe(SESSION_STATE.idle);
    expect(lobbyStore.getSnapshot().roomCode).toBeNull();
  });

  it("createRoom from a non-idle state throws", () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    expect(() => host.createRoom("Again")).toThrow(
      "cannot create room from state hostingLobby",
    );
  });

  it("setLobbyBotCount clamps and broadcasts the lobby to a connected client", async () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    const client = createController(hub, timers.timers);
    client.joinRoom(roomCode(), "Ann");
    await flush();
    const sentBefore = hub.connections
      .filter((conn) => conn.owner === hostPeerIdFor(roomCode()))
      .flatMap((conn) => conn.sent).length;

    host.setLobbyBotCount(999);

    const maxBots = gameConfig.maxCars - gameConfig.maxHumans;
    expect(lobbyStore.getSnapshot().bots).toBe(maxBots);
    const lobbyBots = hub.connections
      .filter((conn) => conn.owner === hostPeerIdFor(roomCode()))
      .flatMap((conn) => conn.sent)
      .slice(sentBefore)
      .map((raw) => JSON.parse(raw) as { t: string; bots?: number });
    expect(lobbyBots).toContainEqual(
      expect.objectContaining({ t: "lobby", bots: maxBots }),
    );
  });

  it("setLobbyGameMode and setLobbyBotDifficulty update the store in hostingLobby", () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    host.setLobbyGameMode("cash");
    host.setLobbyBotDifficulty("hard");
    expect(lobbyStore.getSnapshot()).toMatchObject({
      gameMode: "cash",
      botDifficulty: "hard",
    });
  });

  it("lobby setters are ignored outside hostingLobby", () => {
    const host = createController(hub, timers.timers);
    host.setLobbyBotCount(3);
    host.setLobbyGameMode("cash");
    host.setLobbyBotDifficulty("hard");
    expect(lobbyStore.getSnapshot()).toMatchObject({
      role: "none",
      bots: 0,
      gameMode: "crashfest",
      botDifficulty: "normal",
    });
  });

  it("the host roster lists joined clients with the host still at pid 0", async () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    const client = createController(hub, timers.timers);
    client.joinRoom(roomCode(), "Ann");
    await flush();
    expect(lobbyStore.getSnapshot().players.map((p) => p.pid)).toEqual([0, 1]);
  });

  it("startMatch with fewer than 2 cars sets an error and stays in hostingLobby", () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    host.setLobbyBotCount(0);
    host.startMatch();
    expect(host.getState()).toBe(SESSION_STATE.hostingLobby);
    expect(lobbyStore.getSnapshot().error).toBe("Need at least 2 cars");
  });

  it("startMatch is a no-op outside hostingLobby", () => {
    const host = createController(hub, timers.timers);
    host.startMatch();
    expect(host.getState()).toBe(SESSION_STATE.idle);
  });

  it("host returnToLobby is ignored unless the match ended", () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    host.returnToLobby();
    expect(host.getState()).toBe(SESSION_STATE.hostingLobby);
  });

  it("backToIdle from hostingLobby tears down the room transport", () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    host.backToIdle();
    expect(host.getState()).toBe(SESSION_STATE.idle);
    expect(lobbyStore.getSnapshot()).toMatchObject({
      roomCode: null,
      role: "none",
    });
  });
});

describe("SessionController client lobby", () => {
  let hub: FakePeerHub;
  let timers: ManualTimers;

  beforeEach(() => {
    lobbyStore.reset();
    hub = new FakePeerHub();
    timers = createManualTimers();
  });

  it("joinRoom from a non-idle state throws", () => {
    const client = createController(hub, timers.timers);
    client.joinRoom("ABCDEF", "Ann");
    expect(() => client.joinRoom("ABCDEF", "Bob")).toThrow(
      "cannot join room from state joining",
    );
  });

  it("joinRoom enters joining with a connecting store status and arms the connect timer", () => {
    const client = createController(hub, timers.timers);
    client.joinRoom("ABCDEF", "Ann");
    expect(client.getState()).toBe(SESSION_STATE.joining);
    expect(lobbyStore.getSnapshot()).toMatchObject({
      role: "client",
      roomCode: "ABCDEF",
      status: "connecting",
    });
    expect(timers.pending()).toBe(1);
  });

  it("connect timeout moves an unreachable join to idle with Connection failed", async () => {
    vi.useFakeTimers();
    try {
      const client = createController(hub, timers.timers);
      client.joinRoom("ABCDEF", "Ann");
      await vi.advanceTimersByTimeAsync(gameConfig.lobbyConnectTimeoutMs - 1);
      expect(client.getState()).toBe(SESSION_STATE.joining);
      expect(lobbyStore.getSnapshot().error).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("connect timeout with the production-style timers goes idle and reports the error", async () => {
    vi.useFakeTimers();
    try {
      const client = new SessionController({
        createRenderer: vi.fn(),
        hud: createHudStore(),
        createAudio: () => ({ unlock: vi.fn(), dispose: vi.fn() }) as never,
        requestFrame: () => 0,
        cancelFrame: () => undefined,
        lobby: {
          peerFactory: hub.factory,
          timers: {
            setTimeout: (cb, ms) => setTimeout(cb, ms),
            clearTimeout: (h) => clearTimeout(h as never),
          },
        },
      });
      client.joinRoom("ABCDEF", "Ann");
      await vi.advanceTimersByTimeAsync(gameConfig.lobbyConnectTimeoutMs);
      expect(client.getState()).toBe(SESSION_STATE.idle);
      expect(lobbyStore.getSnapshot()).toMatchObject({
        role: "none",
        status: "error",
        error: "Connection failed",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("a successful join clears the connect timer", async () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    const client = createController(hub, timers.timers);
    client.joinRoom(roomCode(), "Ann");
    await flush();
    expect(client.getState()).toBe(SESSION_STATE.joinedLobby);
    expect(timers.pending()).toBe(0);
  });

  it("host leaving a joined lobby returns the client to idle with Host left the room", async () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    const client = createController(hub, timers.timers);
    client.joinRoom(roomCode(), "Ann");
    await flush();

    const published: Array<{ status: string; error: string | null }> = [];
    const unsubscribe = lobbyStore.subscribe(() => {
      const { status, error } = lobbyStore.getSnapshot();
      published.push({ status, error });
    });
    host.backToIdle();
    await flush();
    unsubscribe();
    expect(client.getState()).toBe(SESSION_STATE.idle);
    expect(published).toContainEqual({
      status: "error",
      error: "Host left the room",
    });
  });

  it("a fourth client is rejected with Room is full and returns to idle", async () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    for (let index = 0; index < 3; index += 1) {
      createController(hub, timers.timers).joinRoom(roomCode(), `P${index}`);
      await flush();
    }
    const late = createController(hub, timers.timers);
    late.joinRoom(roomCode(), "Late");
    await flush();
    expect(late.getState()).toBe(SESSION_STATE.idle);
    expect(lobbyStore.getSnapshot().error).toBe("Room is full");
  });

  it("client returnToLobby is ignored unless the match ended", async () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    const client = createController(hub, timers.timers);
    client.joinRoom(roomCode(), "Ann");
    await flush();
    client.returnToLobby();
    expect(client.getState()).toBe(SESSION_STATE.joinedLobby);
  });

  it("client backToIdle from joinedLobby closes the transport and resets the store", async () => {
    const host = createController(hub, timers.timers);
    host.createRoom("Host");
    const client = createController(hub, timers.timers);
    client.joinRoom(roomCode(), "Ann");
    await flush();
    client.backToIdle();
    expect(client.getState()).toBe(SESSION_STATE.idle);
    expect(lobbyStore.getSnapshot()).toMatchObject({
      roomCode: null,
      role: "none",
      status: "idle",
    });
  });

  it("peer error during joining maps the error detail through peerErrorToMessage", () => {
    const client = createController(hub, timers.timers);
    client.joinRoom("ABCDEF", "Ann");
    const clientId = hub.peerIds().at(-1) ?? "";
    hub.peer(clientId)?.emit("error", { type: "network" });
    expect(client.getState()).toBe(SESSION_STATE.idle);
    expect(lobbyStore.getSnapshot().error).toBe("Signaling server unreachable");
  });
});
