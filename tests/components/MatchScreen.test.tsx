// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("../../src/game/Renderer", () => ({
  createWorldRenderer: vi.fn(async () => ({
    update() {},
    resize() {},
    destroy() {},
  })),
}));

vi.mock("../../src/session/SessionController", () => {
  const listeners = new Set<() => void>();
  const inputBuffer = {
    write() {},
    latest: () => ({ throttle: 0, steer: 0, action: false, seq: 0 }),
  };
  const sessionController = {
    getState: () => "idle",
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getInputBuffer: () => inputBuffer,
    startSolo: vi.fn(async () => undefined),
    setPaused: vi.fn(),
    backToIdle: vi.fn(),
    endMatch: vi.fn(),
  };
  return {
    SESSION_STATE: { idle: "idle", playingSolo: "playingSolo", ended: "ended" },
    sessionController,
  };
});

import { MatchScreen } from "../../src/components/hud/MatchScreen";

describe("MatchScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the game surface host element", () => {
    const { container } = render(
      <MatchScreen
        options={{
          botCount: 1,
          botDifficulty: "easy",
          matchSeconds: 180,
          seed: 1,
        }}
        onExit={vi.fn()}
      />,
    );
    expect(container.querySelector(".game-surface")).not.toBeNull();
  });
});
