// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/game/Renderer", () => ({
  createWorldRenderer: vi.fn(),
}));

import {
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
    lobby: { peerFactory: hub.factory, timers: LOBBY_TIMERS },
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("host roster", () => {
  let hub: FakePeerHub;

  beforeEach(() => {
    lobbyStore.reset();
    hub = new FakePeerHub();
  });

  it("lists host pid 0 and joined client pid 1", async () => {
    const host = createController(hub);
    host.createRoom("Host");
    const code = lobbyStore.getSnapshot().roomCode ?? "";

    const client = createController(hub);
    client.joinRoom(code, "Ann");
    await flush();

    const players = lobbyStore.getSnapshot().players;
    expect(players).toContainEqual(expect.objectContaining({ pid: 0 }));
    expect(players).toContainEqual(expect.objectContaining({ pid: 1 }));
    expect(players).toHaveLength(2);
  });
});
