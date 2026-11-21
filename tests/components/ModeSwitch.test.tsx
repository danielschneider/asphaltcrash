// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ModeSwitch, START_MODES } from "../../src/components/lobby/ModeSwitch";
import { StartScreen } from "../../src/components/lobby/StartScreen";

vi.mock("../../src/session/SessionController", () => ({
  sessionController: {
    backToIdle: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    unlockAudio: vi.fn(),
  },
}));

const SOLO_CONTROLS = ["slider"] as const;

describe("ModeSwitch", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
    vi.clearAllMocks();
  });

  it("marks the active mode as checked", () => {
    render(<ModeSwitch mode={START_MODES.multiplayer} onChange={vi.fn()} />);
    expect(
      screen
        .getByRole("radio", { name: "Multiplayer" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("radio", { name: "Single player" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("calls onChange with the clicked mode", () => {
    const onChange = vi.fn();
    render(<ModeSwitch mode={START_MODES.solo} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Multiplayer" }));
    expect(onChange).toHaveBeenCalledWith(START_MODES.multiplayer);
  });
});

describe("StartScreen mode switching", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows only solo controls in single player mode", () => {
    render(<StartScreen onStart={vi.fn()} />);
    for (const role of SOLO_CONTROLS) {
      expect(screen.getByRole(role)).toBeTruthy();
    }
    expect(screen.getByLabelText("Game mode")).toBeTruthy();
    expect(screen.getByLabelText("Difficulty")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play vs CPU" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Host room" })).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("shows only multiplayer controls after switching", () => {
    render(<StartScreen onStart={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Multiplayer" }));
    expect(screen.getByRole("button", { name: "Host room" })).toBeTruthy();
    expect(screen.getByLabelText("Room code")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join" })).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByLabelText("Game mode")).toBeNull();
    expect(screen.queryByLabelText("Difficulty")).toBeNull();
    expect(screen.queryByRole("button", { name: "Play vs CPU" })).toBeNull();
  });

  it("returns to solo controls when switching back", () => {
    render(<StartScreen onStart={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Multiplayer" }));
    fireEvent.click(screen.getByRole("radio", { name: "Single player" }));
    expect(screen.getByRole("button", { name: "Play vs CPU" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Host room" })).toBeNull();
  });
});
