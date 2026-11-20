import { useId, type ChangeEvent } from "react";
import { gameConfig } from "../../config/gameConfig";
import { useLobby } from "../../hooks/useLobby";
import { sessionController } from "../../session/SessionController";
import {
  MAX_LOBBY_BOTS,
  MIN_LOBBY_BOTS,
  rosterWithBots,
  totalCarCount,
} from "../../session/lobbyRoster";
import { lobbyStatusText, type LobbySnapshot } from "../../store/lobbyStore";

const EMPTY_ROOM_CODE = "------";
const MIN_START_CARS = 2;

function describeRole(snapshot: LobbySnapshot): string {
  if (snapshot.role === "host") return "Hosting";
  return snapshot.status === "connecting" ? "Joining" : "Joined";
}

function describeStatus(snapshot: LobbySnapshot): string {
  if (snapshot.status === "connecting") return "Connecting...";
  if (snapshot.status === "ready") return "Ready";
  if (snapshot.status === "error") return "Error";
  return "Idle";
}

export function LobbyScreen() {
  const snapshot = useLobby();
  const botCountId = useId();

  const handleBack = (): void => {
    sessionController.backToIdle();
  };

  const handleStartMatch = (): void => {
    sessionController.startMatch();
  };

  const handleBotCountChange = (event: ChangeEvent<HTMLInputElement>): void => {
    sessionController.setLobbyBotCount(Number(event.target.value));
  };

  const waitingText = lobbyStatusText(snapshot);
  const roster = rosterWithBots(snapshot.players, snapshot.bots);
  const isHost = snapshot.role === "host";
  const total = totalCarCount(snapshot.players.length, snapshot.bots);
  const canStart = isHost && total >= MIN_START_CARS;

  return (
    <div className="start-screen">
      <h1 className="start-title">AsphaltCrash</h1>
      <p className="lobby-subtitle">Lobby</p>
      <div className="start-form">
        <p className="lobby-role">{describeRole(snapshot)}</p>
        <p className="lobby-code" aria-label="Room code">
          {snapshot.roomCode ?? EMPTY_ROOM_CODE}
        </p>
        <p className="lobby-status">{describeStatus(snapshot)}</p>
        {snapshot.error !== null ? (
          <p role="alert" className="lobby-error">
            {snapshot.error}
          </p>
        ) : null}
        <ul className="lobby-players" aria-label="Players">
          {roster.map((row) => (
            <li key={row.key}>{row.label}</li>
          ))}
        </ul>
        {isHost ? (
          <div className="start-field">
            <label htmlFor={botCountId}>Bots: {snapshot.bots}</label>
            <input
              id={botCountId}
              type="range"
              min={MIN_LOBBY_BOTS}
              max={MAX_LOBBY_BOTS}
              step={1}
              value={snapshot.bots}
              onChange={handleBotCountChange}
            />
            <p className="lobby-bots-total">
              {`Total cars: ${total} / ${gameConfig.maxCars}`}
            </p>
          </div>
        ) : null}
        {waitingText !== null ? (
          <p role="status" className="lobby-waiting">
            {waitingText}
          </p>
        ) : null}
        {isHost ? (
          <button
            type="button"
            className="button button-primary"
            disabled={!canStart}
            onClick={handleStartMatch}
          >
            Start match
          </button>
        ) : null}
        <button type="button" className="button" onClick={handleBack}>
          Back
        </button>
      </div>
    </div>
  );
}
