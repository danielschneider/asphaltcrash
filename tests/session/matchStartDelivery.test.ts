// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/game/Renderer", () => ({
  createWorldRenderer: vi.fn(),
}));

import { PeerTransport } from "../../src/network/transport/PeerTransport";
import type { NetworkMessage } from "../../src/network/protocol/messages";
import {
  SESSION_STATE,
  SessionController,
  type LobbyDeps,
} from "../../src/session/SessionController";
import { createHudStore } from "../../src/store/hudStore";
import { lobbyStore } from "../../src/store/lobbyStore";
import { FakePeerHub } from "../network/transport/fakePeer";

const LOBBY_TIMERS: LobbyDeps["timers"] = {
  setTimeout: () => 0,
  clearTimeout: () => undefined,
};

function createController(hub: FakePeerHub): SessionController {
  return new SessionController({
    createRenderer: vi.fn(),
    hud: createHudStore(),
    createAudio: () => ({ unlock: vi.fn(), dispose: vi.fn() }) as never,
    requestFrame: () => 0,
    cancelFrame: () => undefined,
    lobby: { peerFactory: hub.factory, timers: LOBBY_TIMERS },
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("match start delivery", () => {
  let hub: FakePeerHub;

  beforeEach(() => {
    lobbyStore.reset();
    hub = new FakePeerHub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers a start message to the client transport and moves host to playingNetwork", async () => {
    const deliveredStarts = new Set<NetworkMessage>();
    const originalOnMessage = PeerTransport.prototype.onMessage;
    vi.spyOn(PeerTransport.prototype, "onMessage").mockImplementation(function (
      this: PeerTransport,
      handler,
    ) {
      return originalOnMessage.call(this, (msg, from) => {
        if (this.role === "client" && msg.t === "start") {
          deliveredStarts.add(msg);
        }
        handler(msg, from);
      });
    });

    const host = createController(hub);
    host.createRoom("Host");
    const code = lobbyStore.getSnapshot().roomCode ?? "";

    const client = createController(hub);
    client.joinRoom(code, "Ann");
    await flush();
    expect(client.getState()).toBe(SESSION_STATE.joinedLobby);

    host.setLobbyBotCount(1);
    host.startMatch();
    await flush();

    expect(deliveredStarts.size).toBe(1);
    expect([...deliveredStarts][0]).toMatchObject({ t: "start" });
    expect(host.getState()).toBe(SESSION_STATE.playingNetwork);
    host.backToIdle();
    client.backToIdle();
  });

  it("backToIdle after a running network match returns host to idle and closes the lobby", async () => {
    const host = createController(hub);
    host.createRoom("Host");
    const code = lobbyStore.getSnapshot().roomCode ?? "";
    const client = createController(hub);
    client.joinRoom(code, "Ann");
    await flush();
    host.setLobbyBotCount(1);
    host.startMatch();
    await flush();
    expect(host.getState()).toBe(SESSION_STATE.playingNetwork);
    host.backToIdle();
    expect(host.getState()).toBe(SESSION_STATE.idle);
    client.backToIdle();
  });
});
