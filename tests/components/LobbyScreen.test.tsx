// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LobbyScreen } from "../../src/components/lobby/LobbyScreen";
import { lobbyStore } from "../../src/store/lobbyStore";
import { sessionController } from "../../src/session/SessionController";

vi.mock("../../src/session/SessionController", () => ({
  sessionController: {
    backToIdle: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    setLobbyBotCount: vi.fn(),
    unlockAudio: vi.fn(),
  },
}));

describe("LobbyScreen", () => {
  beforeEach(() => {
    lobbyStore.reset();
    lobbyStore.set({
      role: "host",
      roomCode: "ABC234",
      status: "ready",
      pid: 0,
      players: [
        { pid: 0, name: "Alice" },
        { pid: 1, name: "Bob" },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    lobbyStore.reset();
    vi.clearAllMocks();
  });

  it("renders role, room code and player list", () => {
    render(<LobbyScreen />);
    expect(screen.getByText("Hosting")).toBeTruthy();
    expect(screen.getByLabelText("Room code").textContent).toBe("ABC234");
    const players = screen.getByRole("list", { name: "Players" });
    expect(players.textContent).toContain("0: Alice");
    expect(players.textContent).toContain("1: Bob");
  });

  it("renders the AsphaltCrash title with Lobby as subtitle", () => {
    render(<LobbyScreen />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "AsphaltCrash",
    );
    expect(screen.getByText("Lobby").tagName).toBe("P");
  });

  it("enables Start match for the host with at least two cars", () => {
    lobbyStore.set({
      role: "host",
      roomCode: "ABC234",
      status: "ready",
      players: [{ pid: 0, name: "Host" }],
      bots: 1,
    });
    render(<LobbyScreen />);
    expect(screen.getByRole("button", { name: "Start match" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("disables Start match when only one car is in the lobby", () => {
    lobbyStore.set({
      role: "host",
      roomCode: "ABC234",
      status: "ready",
      players: [{ pid: 0, name: "Host" }],
      bots: 0,
    });
    render(<LobbyScreen />);
    expect(screen.getByRole("button", { name: "Start match" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows lobby error in an alert element", () => {
    lobbyStore.set({ status: "error", error: "Room is full" });
    render(<LobbyScreen />);
    expect(screen.getByRole("alert").textContent).toBe("Room is full");
  });

  it("shows waiting text for a ready client", () => {
    lobbyStore.set({ role: "client", status: "ready" });
    render(<LobbyScreen />);
    expect(screen.getByRole("status").textContent).toBe("Waiting for host");
  });

  it("does not show waiting text for a host", () => {
    render(<LobbyScreen />);
    expect(screen.queryByText("Waiting for host")).toBeNull();
  });

  it("returns to idle on Back", () => {
    render(<LobbyScreen />);
    screen.getByRole("button", { name: "Back" }).click();
    expect(sessionController.backToIdle).toHaveBeenCalledTimes(1);
  });

  it("shows the CPU control to the host with the total car count", () => {
    render(<LobbyScreen />);
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("min")).toBe("0");
    expect(slider.getAttribute("max")).toBe("12");
    expect(screen.getByText("Total cars: 2 / 16")).toBeTruthy();
  });

  it("hides the CPU control from a client", () => {
    lobbyStore.set({ role: "client", status: "ready" });
    render(<LobbyScreen />);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("lists CPU rows after human rows", () => {
    lobbyStore.set({ bots: 2 });
    render(<LobbyScreen />);
    const items = screen.getByRole("list", { name: "Players" }).textContent;
    expect(items).toBe("0: Alice1: BobCPU 1CPU 2");
  });

  it("forwards CPU count changes to the session controller", () => {
    render(<LobbyScreen />);
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: "3" },
    });
    expect(sessionController.setLobbyBotCount).toHaveBeenCalledWith(3);
  });
});
