import { useId, useState, type ChangeEvent } from "react";
import { gameConfig } from "../../config/gameConfig";
import { useLobby } from "../../hooks/useLobby";
import { sessionController } from "../../session/SessionController";
import type { BotDifficulty, GameMode } from "../../types/game";
import {
  MAX_LOBBY_BOTS,
  MIN_LOBBY_BOTS,
  rosterWithBots,
  totalCarCount,
} from "../../session/lobbyRoster";
import { lobbyStatusText, type LobbySnapshot } from "../../store/lobbyStore";
import { Brand } from "../brand/Brand";
import { ChoiceGroup } from "./ChoiceGroup";
import { difficultyOptions, gameModeOptions } from "./lobbyOptions";

const EMPTY_ROOM_CODE = "------";
const MIN_START_CARS = 2;
const COPY_FEEDBACK_MS = 1500;

const GAME_MODE_LABELS: Readonly<Record<GameMode, string>> = {
  cash: "Cash run",
  crashfest: "Crashfest",
};

const DIFFICULTY_LABELS: Readonly<Record<BotDifficulty, string>> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};

function gameModeLabel(mode: GameMode): string {
  return GAME_MODE_LABELS[mode];
}

function difficultyLabel(level: BotDifficulty): string {
  return DIFFICULTY_LABELS[level];
}

type CopyState = "idle" | "copied" | "failed";

const COPY_LABELS = {
  idle: "Copy",
  copied: "Copied",
  failed: "Failed",
} as const satisfies Record<CopyState, string>;

async function writeToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

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
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const handleBack = (): void => {
    sessionController.backToIdle();
  };

  const handleCopyCode = (): void => {
    if (snapshot.roomCode === null) return;
    writeToClipboard(snapshot.roomCode)
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("failed"))
      .finally(() => {
        window.setTimeout(() => setCopyState("idle"), COPY_FEEDBACK_MS);
      });
  };

  const copyLabel = COPY_LABELS[copyState];

  const handleStartMatch = (): void => {
    sessionController.startMatch();
  };

  const handleBotCountChange = (event: ChangeEvent<HTMLInputElement>): void => {
    sessionController.setLobbyBotCount(Number(event.target.value));
  };

  const handleGameModeChange = (gameMode: GameMode): void => {
    sessionController.setLobbyGameMode(gameMode);
  };

  const handleDifficultyChange = (botDifficulty: BotDifficulty): void => {
    sessionController.setLobbyBotDifficulty(botDifficulty);
  };

  const waitingText = lobbyStatusText(snapshot);
  const roster = rosterWithBots(snapshot.players, snapshot.bots);
  const isHost = snapshot.role === "host";
  const total = totalCarCount(snapshot.players.length, snapshot.bots);
  const canStart = isHost && total >= MIN_START_CARS;

  return (
    <div className="menu-screen">
      <div className="menu-inner">
        <Brand />
        <p className="menu-subtitle">Lobby</p>
        <div className="menu-card">
          <div className="start-form">
            <p className="lobby-role">{describeRole(snapshot)}</p>
            <div className="lobby-code-row">
              <p className="lobby-code" aria-label="Room code">
                {snapshot.roomCode ?? EMPTY_ROOM_CODE}
              </p>
              <button
                type="button"
                className="button lobby-copy-button"
                disabled={snapshot.roomCode === null}
                onClick={handleCopyCode}
              >
                {copyLabel}
              </button>
            </div>
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
              <>
                <ChoiceGroup<GameMode>
                  label="Game mode"
                  variant="cards"
                  options={gameModeOptions}
                  value={snapshot.gameMode}
                  onChange={handleGameModeChange}
                />
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
                <ChoiceGroup<BotDifficulty>
                  label="Difficulty"
                  variant="segmented"
                  options={difficultyOptions}
                  value={snapshot.botDifficulty}
                  onChange={handleDifficultyChange}
                />
              </>
            ) : (
              <dl className="lobby-settings">
                <div>
                  <dt>Game mode</dt>
                  <dd>{gameModeLabel(snapshot.gameMode)}</dd>
                </div>
                <div>
                  <dt>Difficulty</dt>
                  <dd>{difficultyLabel(snapshot.botDifficulty)}</dd>
                </div>
                <div>
                  <dt>Bots</dt>
                  <dd>{snapshot.bots}</dd>
                </div>
              </dl>
            )}
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
      </div>
    </div>
  );
}
