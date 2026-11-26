// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

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
import type { WorldRenderer } from "../../src/game/Renderer";
import { hostPeerIdFor } from "../../src/network/room/roomCode";
import { FakePeerHub } from "../network/transport/fakePeer";

const LOBBY_TIMERS: LobbyDeps["timers"] = {
  setTimeout: () => 0,
  clearTimeout: () => undefined,
};

interface RemoteConnection {
  on(event: string, handler: (raw?: unknown) => void): void;
  send(data: string): void;
}

interface Harness {
  readonly controller: SessionController;
  readonly frames: Array<(t: number) => void>;
}

function createHarness(hub: FakePeerHub): Harness {
  const frames: Array<(t: number) => void> = [];
  const controller = new SessionController({
    createRenderer: async (): Promise<WorldRenderer> => ({
      update: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
    }),
    hud: createHudStore(),
    createAudio: () => ({ unlock: vi.fn(), dispose: vi.fn() }) as never,
    requestFrame: (cb) => {
      frames.push(cb);
      return frames.length;
    },
    cancelFrame: () => undefined,
    lobby: { peerFactory: hub.factory, timers: LOBBY_TIMERS },
  });
  return { controller, frames };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function roomCode(): string {
  return lobbyStore.getSnapshot().roomCode ?? "";
}

describe("SessionController network match outcomes", () => {
  let hub: FakePeerHub;

  beforeEach(() => {
    lobbyStore.reset();
    hub = new FakePeerHub();
  });

  it("maps a handshake reject reason to the lobby error and returns to idle", async () => {
    const fakeHostId = hostPeerIdFor("ZZZZZZ");
    const fakeHost = hub.factory(fakeHostId);
    fakeHost.on("connection", (conn?: unknown) => {
      const remote = conn as RemoteConnection;
      remote.on("data", () => {
        remote.send(JSON.stringify({ v: 1, t: "reject", reason: "running" }));
      });
    });

    const client = createHarness(hub).controller;
    client.joinRoom("ZZZZZZ", "Ann");
    await flush();

    expect(client.getState()).toBe(SESSION_STATE.idle);
    expect(lobbyStore.getSnapshot()).toMatchObject({
      role: "none",
      status: "error",
      error: "Match already running",
    });
  });

  it("a client joining a lobby sends a valid hello and lands in joinedLobby", async () => {
    const host = createHarness(hub);
    host.controller.createRoom("Host");
    const client = createHarness(hub);
    client.controller.joinRoom(roomCode(), "Ann");
    await flush();

    expect(client.controller.getState()).toBe(SESSION_STATE.joinedLobby);
    const types = hub.connections
      .flatMap((conn) => conn.sent)
      .map((raw) => (JSON.parse(raw) as { t: string }).t);
    expect(types.filter((type) => type === "hello")).toHaveLength(1);
  });

  it("a cash match ends for host and client, then both return to their lobbies", async () => {
    const host = createHarness(hub);
    host.controller.createRoom("Host");
    const client = createHarness(hub);
    client.controller.joinRoom(roomCode(), "Ann");
    await flush();

    host.controller.setLobbyBotCount(0);
    host.controller.setLobbyGameMode("cash");
    host.controller.setLobbyBotDifficulty("easy");
    await flush();
    host.controller.startMatch();
    await flush();
    expect(host.controller.getState()).toBe(SESSION_STATE.playingNetwork);
    expect(client.controller.getState()).toBe(SESSION_STATE.playingNetwork);

    await client.controller.attachMatchRenderer({} as HTMLElement);
    const hostLoop = host.frames.at(-1);
    const start = performance.now();
    for (let elapsed = 0; elapsed <= 200 * 1000; elapsed += 250) {
      hostLoop?.(start + elapsed);
    }
    await flush();

    expect(host.controller.getState()).toBe(SESSION_STATE.endedNetwork);
    expect(client.controller.getState()).toBe(SESSION_STATE.endedNetwork);

    host.controller.returnToLobby();
    client.controller.returnToLobby();
    expect(host.controller.getState()).toBe(SESSION_STATE.hostingLobby);
    expect(client.controller.getState()).toBe(SESSION_STATE.joinedLobby);
  });

  it("host backToIdle during a network match sends the client to idle", async () => {
    const host = createHarness(hub);
    host.controller.createRoom("Host");
    const client = createHarness(hub);
    client.controller.joinRoom(roomCode(), "Ann");
    await flush();
    host.controller.startMatch();
    await flush();

    const errors: Array<string | null> = [];
    const unsubscribe = lobbyStore.subscribe(() => {
      errors.push(lobbyStore.getSnapshot().error);
    });
    host.controller.backToIdle();
    await flush();
    unsubscribe();
    expect(host.controller.getState()).toBe(SESSION_STATE.idle);
    expect(client.controller.getState()).toBe(SESSION_STATE.idle);
    expect(errors).toContain("Host left the room");
  });

  it("returnToLobby is ignored in playingNetwork", async () => {
    const host = createHarness(hub);
    host.controller.createRoom("Host");
    const client = createHarness(hub);
    client.controller.joinRoom(roomCode(), "Ann");
    await flush();
    host.controller.startMatch();
    await flush();
    host.controller.returnToLobby();
    expect(host.controller.getState()).toBe(SESSION_STATE.playingNetwork);
    host.controller.backToIdle();
    client.controller.backToIdle();
  });
});
