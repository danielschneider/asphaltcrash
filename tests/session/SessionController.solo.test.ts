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

import {
  SESSION_STATE,
  SessionController,
} from "../../src/session/SessionController";
import { gameConfig } from "../../src/config/gameConfig";
import { createHudStore, type HudStore } from "../../src/store/hudStore";
import type { WorldRenderer } from "../../src/game/Renderer";
import type { MatchSnapshot } from "../../src/types/game";

const SOLO = {
  gameMode: "cash" as const,
  botCount: 1,
  botDifficulty: "easy" as const,
  matchSeconds: 180,
  seed: 42,
};

const CRASHFEST_SOLO = { ...SOLO, gameMode: "crashfest" as const };

type FakeRenderer = WorldRenderer & { destroy: Mock<() => void> };

function createFakeRenderer(): FakeRenderer {
  return { update: vi.fn(), resize: vi.fn(), destroy: vi.fn<() => void>() };
}

function createController(
  createRenderer: () => Promise<WorldRenderer>,
  hud: HudStore,
): SessionController {
  return new SessionController({
    createRenderer,
    hud,
    createAudio: () => ({ unlock: vi.fn(), dispose: vi.fn() }) as never,
    requestFrame: () => 1,
    cancelFrame: () => undefined,
  });
}

function snapshotWithScores(
  cars: ReadonlyArray<{ pid: number; score: number }>,
): MatchSnapshot {
  return { cars } as unknown as MatchSnapshot;
}

describe("SessionController solo lifecycle", () => {
  let renderer: FakeRenderer;
  let hud: HudStore;
  let controller: SessionController;

  beforeEach(() => {
    renderer = createFakeRenderer();
    hud = createHudStore();
    controller = createController(async () => renderer, hud);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("startSolo creates an engine and enters playingSolo", async () => {
    await controller.startSolo(SOLO, {} as HTMLElement);
    expect(controller.getState()).toBe(SESSION_STATE.playingSolo);
    expect(controller.getEngine()).not.toBeNull();
    expect(renderer.destroy).not.toHaveBeenCalled();
  });

  it("startSolo rejects when not idle", async () => {
    await controller.startSolo(SOLO, {} as HTMLElement);
    await expect(controller.startSolo(SOLO, {} as HTMLElement)).rejects.toThrow(
      "cannot start solo from state playingSolo",
    );
  });

  it("backToIdle during the renderer await destroys the late renderer and stays idle", async () => {
    const resolvers: Array<(value: WorldRenderer) => void> = [];
    controller = createController(
      () =>
        new Promise<WorldRenderer>((resolve) => {
          resolvers.push(resolve);
        }),
      hud,
    );

    const starting = controller.startSolo(SOLO, {} as HTMLElement);
    controller.backToIdle();
    resolvers[0]?.(renderer);
    await starting;

    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toBe(SESSION_STATE.idle);
    expect(controller.getEngine()).toBeNull();
  });

  it("a start superseded by backToIdle and a new start keeps only the new renderer", async () => {
    const first = createFakeRenderer();
    const second = createFakeRenderer();
    const resolvers: Array<(value: WorldRenderer) => void> = [];
    controller = createController(
      () =>
        new Promise<WorldRenderer>((resolve) => {
          resolvers.push(resolve);
        }),
      hud,
    );

    const staleStart = controller.startSolo(SOLO, {} as HTMLElement);
    controller.backToIdle();
    const freshStart = controller.startSolo(SOLO, {} as HTMLElement);
    resolvers[0]?.(first);
    resolvers[1]?.(second);
    await Promise.all([staleStart, freshStart]);

    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.destroy).not.toHaveBeenCalled();
    expect(controller.getState()).toBe(SESSION_STATE.playingSolo);
  });

  it("endMatch in cash ends immediately with a snapshot pushed to the HUD", async () => {
    await controller.startSolo(SOLO, {} as HTMLElement);
    controller.endMatch(snapshotWithScores([{ pid: 0, score: 7 }]), [0]);

    expect(controller.getState()).toBe(SESSION_STATE.ended);
    expect(hud.getSnapshot()).toMatchObject({
      gameMode: "cash",
      localPid: 0,
      score: 7,
      remainingMs: 0,
      winnerPids: [0],
    });
    expect(renderer.destroy).not.toHaveBeenCalled();
  });

  it("endMatch in crashfest with winners waits the result delay, then ends", async () => {
    vi.useFakeTimers();
    await controller.startSolo(CRASHFEST_SOLO, {} as HTMLElement);

    controller.endMatch(snapshotWithScores([{ pid: 0, score: 3 }]), [0]);
    controller.endMatch(undefined, [0]);
    expect(controller.getState()).toBe(SESSION_STATE.playingSolo);
    expect(hud.getSnapshot()).toMatchObject({
      gameMode: "crashfest",
      score: 3,
    });

    await vi.advanceTimersByTimeAsync(
      gameConfig.crashfestResultDelaySeconds * 1000 - 1,
    );
    expect(controller.getState()).toBe(SESSION_STATE.playingSolo);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.getState()).toBe(SESSION_STATE.ended);
  });

  it("backToIdle cancels a pending crashfest result timer", async () => {
    vi.useFakeTimers();
    await controller.startSolo(CRASHFEST_SOLO, {} as HTMLElement);
    controller.endMatch(undefined, [0]);
    controller.backToIdle();

    await vi.advanceTimersByTimeAsync(
      gameConfig.crashfestResultDelaySeconds * 1000,
    );
    expect(controller.getState()).toBe(SESSION_STATE.idle);
  });

  it("endMatch is ignored when no solo match is running", () => {
    controller.endMatch();
    expect(controller.getState()).toBe(SESSION_STATE.idle);
  });

  it("HUD remaining time reaching zero in cash ends the match", async () => {
    await controller.startSolo(SOLO, {} as HTMLElement);
    hud.push({
      ...hud.getSnapshot(),
      gameMode: "cash",
      remainingMs: 0,
    });
    expect(controller.getState()).toBe(SESSION_STATE.ended);
  });

  it("HUD zero remaining time does not end a crashfest match", async () => {
    await controller.startSolo(CRASHFEST_SOLO, {} as HTMLElement);
    hud.push({
      ...hud.getSnapshot(),
      gameMode: "crashfest",
      remainingMs: 0,
    });
    expect(controller.getState()).toBe(SESSION_STATE.playingSolo);
  });

  it("backToIdle during a running solo match destroys the renderer and engine", async () => {
    await controller.startSolo(SOLO, {} as HTMLElement);
    controller.backToIdle();
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toBe(SESSION_STATE.idle);
    expect(controller.getEngine()).toBeNull();
  });

  it("notifies subscribers on every state change", async () => {
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    await controller.startSolo(SOLO, {} as HTMLElement);
    controller.endMatch();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    controller.backToIdle();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
