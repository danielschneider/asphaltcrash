// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StartScreen } from "../../src/components/lobby/StartScreen";
import { gameConfig } from "../../src/config/gameConfig";

vi.mock("../../src/session/SessionController", () => ({
  sessionController: {
    backToIdle: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    unlockAudio: vi.fn(),
  },
}));

const SINGLE_PLAYER = { name: "Single player" };
const MULTIPLAYER = { name: "Multiplayer" };

describe("StartScreen", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
    vi.clearAllMocks();
  });

  it("renders bot count, difficulty and play controls in single player mode", () => {
    render(<StartScreen onStart={vi.fn()} />);
    expect(
      screen.getByRole("radio", SINGLE_PLAYER).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByRole("slider")).toBeTruthy();
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play vs CPU" })).toBeTruthy();
  });

  it("starts a solo match with default options", () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Play vs CPU" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      botCount: gameConfig.botDefaultCount,
      botDifficulty: "normal",
      matchSeconds: gameConfig.matchSeconds,
    });
  });

  it("opens multiplayer mode automatically for a join link", () => {
    window.history.pushState({}, "", "/?join=xyz234");
    render(<StartScreen onStart={vi.fn()} />);
    expect(
      screen.getByRole("radio", MULTIPLAYER).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByLabelText<HTMLInputElement>("Room code").value).toBe(
      "XYZ234",
    );
    expect(screen.queryByRole("button", { name: "Play vs CPU" })).toBeNull();
  });
});
