// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StartScreen } from "../../src/components/lobby/StartScreen";
import { gameConfig } from "../../src/config/gameConfig";

describe("StartScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders bot count, difficulty and play controls", () => {
    render(<StartScreen onStart={vi.fn()} />);
    expect(screen.getByRole("slider")).toBeTruthy();
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play vs CPU" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Multiplayer (P2+)" }),
    ).toHaveProperty("disabled", true);
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
});
