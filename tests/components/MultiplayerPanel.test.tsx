// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MultiplayerPanel } from "../../src/components/lobby/MultiplayerPanel";
import { readJoinLinkCode } from "../../src/hooks/useJoinLinkCode";
import { lobbyStore } from "../../src/store/lobbyStore";
import { sessionController } from "../../src/session/SessionController";

vi.mock("../../src/session/SessionController", () => ({
  sessionController: {
    backToIdle: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    unlockAudio: vi.fn(),
  },
}));

const JOIN_BUTTON = { name: "Join" };
const NAME_FORMAT = /^[A-Z][a-z]+(-[A-Z][a-z]+)?-\d{2}$|^[A-Z][a-z]+-\d{2}$/;

describe("MultiplayerPanel", () => {
  beforeEach(() => {
    lobbyStore.reset();
  });

  afterEach(() => {
    cleanup();
    lobbyStore.reset();
    vi.clearAllMocks();
  });

  it("keeps join disabled for an empty or short code", () => {
    render(<MultiplayerPanel initialJoinCode="" />);
    expect(screen.getByRole("button", JOIN_BUTTON)).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.change(screen.getByLabelText("Room code"), {
      target: { value: "ABC" },
    });
    expect(screen.getByRole("button", JOIN_BUTTON)).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("enables join for 6 valid characters and calls joinRoom", () => {
    render(<MultiplayerPanel initialJoinCode="" />);
    fireEvent.change(screen.getByLabelText("Room code"), {
      target: { value: "abc234" },
    });
    const join = screen.getByRole("button", JOIN_BUTTON);
    expect(join).toHaveProperty("disabled", false);
    fireEvent.click(join);
    expect(sessionController.joinRoom).toHaveBeenCalledWith(
      "ABC234",
      expect.stringMatching(NAME_FORMAT),
    );
  });

  it("generates the name immediately on mount", () => {
    render(<MultiplayerPanel initialJoinCode="" />);
    const nameInput = screen.getByLabelText<HTMLInputElement>("Name");
    expect(nameInput.value).not.toBe("");
    expect(nameInput.value).toMatch(NAME_FORMAT);
  });

  it("generates a name on press when the name input is cleared", () => {
    render(<MultiplayerPanel initialJoinCode="" />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Host room" }));
    const [hostName] =
      vi.mocked(sessionController.createRoom).mock.calls[0] ?? [];
    expect(hostName).toMatch(NAME_FORMAT);
    expect(hostName?.length ?? 0).toBeLessThanOrEqual(16);
  });

  it("rejects characters outside the room alphabet", () => {
    render(<MultiplayerPanel initialJoinCode="" />);
    fireEvent.change(screen.getByLabelText("Room code"), {
      target: { value: "ABC01O" },
    });
    expect(screen.getByRole("button", JOIN_BUTTON)).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("prefills the code from the join link", () => {
    expect(readJoinLinkCode("?join=xyz234")).toBe("XYZ234");
    render(<MultiplayerPanel initialJoinCode="XYZ234" />);
    expect(screen.getByLabelText<HTMLInputElement>("Room code").value).toBe(
      "XYZ234",
    );
    expect(screen.getByRole("button", JOIN_BUTTON)).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("calls createRoom with the entered name", () => {
    render(<MultiplayerPanel initialJoinCode="" />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Carla" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Host room" }));
    expect(sessionController.createRoom).toHaveBeenCalledWith("Carla");
  });

  it("refresh button fills the name field and Host uses that value", () => {
    render(<MultiplayerPanel initialJoinCode="" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate new name" }));
    const nameInput = screen.getByLabelText<HTMLInputElement>("Name");
    expect(nameInput.value).toMatch(NAME_FORMAT);
    fireEvent.click(screen.getByRole("button", { name: "Host room" }));
    expect(sessionController.createRoom).toHaveBeenCalledWith(nameInput.value);
  });

  it("shows lobby error text in an alert element", () => {
    lobbyStore.set({ status: "error", error: "Invalid room code" });
    render(<MultiplayerPanel initialJoinCode="" />);
    expect(screen.getByRole("alert").textContent).toBe("Invalid room code");
  });
});
