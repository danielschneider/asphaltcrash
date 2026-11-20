// @vitest-environment node
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

vi.mock("../../src/game/Renderer", () => ({
  createWorldRenderer: vi.fn(),
}));

import { MatchClient } from "../../src/session/MatchClient";
import {
  SESSION_STATE,
  SessionController,
  type LobbyDeps,
} from "../../src/session/SessionController";
import type { WorldRenderer } from "../../src/game/Renderer";
import type { WorldView } from "../../src/types/game";
import { createHudStore } from "../../src/store/hudStore";
import { lobbyStore } from "../../src/store/lobbyStore";
import { FakePeerHub } from "../network/transport/fakePeer";

const LOBBY_TIMERS: LobbyDeps["timers"] = {
  setTimeout: () => 0,
  clearTimeout: () => undefined,
};

interface FrameHarness {
  readonly controller: SessionController;
  readonly frames: Array<(t: number) => void>;
  readonly renderers: FakeRenderer[];
}

type FakeRenderer = WorldRenderer & {
  update: Mock<(view: WorldView, dtSeconds: number) => void>;
  destroy: Mock<() => void>;
};

function createFakeRenderer(): FakeRenderer {
  return {
    update: vi.fn<(view: WorldView, dtSeconds: number) => void>(),
    resize: vi.fn(),
    destroy: vi.fn<() => void>(),
  };
}

function createHarness(hub: FakePeerHub): FrameHarness {
  const frames: Array<(t: number) => void> = [];
  const renderers: FakeRenderer[] = [];
  const controller = new SessionController({
    createRenderer: async () => {
      const renderer = createFakeRenderer();
      renderers.push(renderer);
      return renderer;
    },
    hud: createHudStore(),
    createAudio: () => ({ unlock: vi.fn(), dispose: vi.fn() }) as never,
    requestFrame: (cb) => {
      frames.push(cb);
      return frames.length;
    },
    cancelFrame: () => undefined,
    lobby: { peerFactory: hub.factory, timers: LOBBY_TIMERS },
  });
  return { controller, frames, renderers };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function connectHostAndClient(hub: FakePeerHub) {
  const host = createHarness(hub);
  host.controller.createRoom("Host");
  const code = lobbyStore.getSnapshot().roomCode ?? "";
  const client = createHarness(hub);
  client.controller.joinRoom(code, "Ann");
  await flush();
  return { host, client };
}

describe("client start before match surface exists", () => {
  let hub: FakePeerHub;

  beforeEach(() => {
    lobbyStore.reset();
    hub = new FakePeerHub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the start pending and starts the client once the surface attaches", async () => {
    const startSpy = vi.spyOn(MatchClient.prototype, "start");
    const { host, client } = await connectHostAndClient(hub);

    host.controller.setLobbyBotCount(1);
    host.controller.startMatch();
    await flush();

    expect(client.controller.getState()).toBe(SESSION_STATE.playingNetwork);
    expect(startSpy).not.toHaveBeenCalled();

    const surface = {} as HTMLElement;
    await client.controller.attachMatchRenderer(surface);
    expect(client.renderers).toHaveLength(1);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(startSpy.mock.calls[0]?.[0]).toMatchObject({ t: "start" });

    await client.controller.attachMatchRenderer(surface);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(client.renderers).toHaveLength(1);

    host.controller.backToIdle();
    client.controller.backToIdle();
  });
});

describe("host match renderer", () => {
  let hub: FakePeerHub;

  beforeEach(() => {
    lobbyStore.reset();
    hub = new FakePeerHub();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates one renderer per surface and feeds it a world view each running frame", async () => {
    const host = createHarness(hub);
    host.controller.createRoom("Host");
    host.controller.setLobbyBotCount(1);
    host.controller.startMatch();

    const surface = {} as HTMLElement;
    await host.controller.attachMatchRenderer(surface);
    await host.controller.attachMatchRenderer(surface);
    expect(host.renderers).toHaveLength(1);

    const loop = host.frames.at(-1);
    expect(loop).toBeDefined();
    loop?.(16);
    loop?.(32);

    const renderer = host.renderers[0];
    expect(renderer?.update).toHaveBeenCalledTimes(2);
    const secondCall = renderer?.update.mock.calls[1];
    expect(secondCall?.[0].cars).toHaveLength(2);
    expect(secondCall?.[0].arena.bases).toHaveLength(2);
    expect(secondCall?.[1]).toBeCloseTo(16 / 1000, 6);

    host.controller.backToIdle();
    expect(renderer?.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the previous renderer when attached to a different surface", async () => {
    const host = createHarness(hub);
    host.controller.createRoom("Host");
    host.controller.setLobbyBotCount(1);
    host.controller.startMatch();

    await host.controller.attachMatchRenderer({} as HTMLElement);
    await host.controller.attachMatchRenderer({} as HTMLElement);
    expect(host.renderers).toHaveLength(2);
    expect(host.renderers[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(host.renderers[1]?.destroy).not.toHaveBeenCalled();
    host.controller.backToIdle();
  });
});
