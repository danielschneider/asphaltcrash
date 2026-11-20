import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

vi.mock("../../src/game/Renderer", () => ({
  createWorldRenderer: vi.fn(),
}));

import {
  SESSION_STATE,
  SessionController,
} from "../../src/session/SessionController";
import { createHudStore } from "../../src/store/hudStore";
import type { WorldRenderer } from "../../src/game/Renderer";

const SOLO = {
  botCount: 1,
  botDifficulty: "easy" as const,
  matchSeconds: 180,
  seed: 42,
};

function createFakeRenderer(): WorldRenderer & { destroy: Mock<() => void> } {
  return { update: vi.fn(), resize: vi.fn(), destroy: vi.fn<() => void>() };
}

describe("SessionController solo flow", () => {
  let renderer: ReturnType<typeof createFakeRenderer>;
  let controller: SessionController;
  let hud: ReturnType<typeof createHudStore>;

  beforeEach(() => {
    renderer = createFakeRenderer();
    hud = createHudStore();
    controller = new SessionController({
      createRenderer: async () => renderer,
      hud,
      requestFrame: () => 1,
      cancelFrame: () => undefined,
    });
  });

  it("moves idle -> playingSolo -> ended on endMatch", async () => {
    const host = {} as HTMLElement;
    await controller.startSolo(SOLO, host);
    expect(controller.getState()).toBe(SESSION_STATE.playingSolo);
    controller.endMatch();
    expect(controller.getState()).toBe(SESSION_STATE.ended);
  });

  it("ends the match when HUD reports zero remaining time", async () => {
    await controller.startSolo(SOLO, {} as HTMLElement);
    hud.push({
      remainingMs: 0,
      score: 0,
      cargo: 0,
      hp: 0,
      scores: [],
      feed: [],
      paused: false,
    });
    expect(controller.getState()).toBe(SESSION_STATE.ended);
  });

  it("backToIdle destroys the renderer and returns to idle", async () => {
    await controller.startSolo(SOLO, {} as HTMLElement);
    controller.backToIdle();
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toBe(SESSION_STATE.idle);
    expect(controller.getEngine()).toBeNull();
  });
});
