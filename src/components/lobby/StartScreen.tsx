import { useId, useState, type ChangeEvent } from "react";
import { gameConfig } from "../../config/gameConfig";
import { useJoinLinkCode } from "../../hooks/useJoinLinkCode";
import {
  BOT_DIFFICULTIES,
  GAME_MODES,
  type BotDifficulty,
  type GameMode,
} from "../../types/game";
import {
  sessionController,
  type SoloMatchOptions,
} from "../../session/SessionController";
import { MultiplayerPanel } from "./MultiplayerPanel";
import { ModeSwitch, START_MODES, type StartMode } from "./ModeSwitch";

interface StartScreenProps {
  readonly onStart: (options: SoloMatchOptions) => void;
}

const MIN_BOTS = 1;
const MAX_BOTS = gameConfig.maxCars - gameConfig.maxHumans;
const DIFFICULTY_LABELS: Readonly<Record<BotDifficulty, string>> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};
const GAME_MODE_LABELS: Readonly<Record<GameMode, string>> = {
  cash: "Cash run",
  crashfest: "Crashfest",
};

function clampBotCount(value: number): number {
  if (Number.isNaN(value)) return gameConfig.botDefaultCount;
  return Math.min(MAX_BOTS, Math.max(MIN_BOTS, Math.round(value)));
}

function isBotDifficulty(value: string): value is BotDifficulty {
  return (BOT_DIFFICULTIES as readonly string[]).includes(value);
}

// Intentional non-sim seed source: the seed is only chosen once per match and is then fully reproduced by the sim RNG.
function createSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

// iPadOS Safari only starts audio after a user gesture. The unlock runs synchronously in handlePlay.
export function StartScreen({ onStart }: StartScreenProps) {
  const [botCount, setBotCount] = useState<number>(gameConfig.botDefaultCount);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("normal");
  const [gameMode, setGameMode] = useState<GameMode>("cash");
  const joinLinkCode = useJoinLinkCode();
  const [mode, setMode] = useState<StartMode>(
    joinLinkCode !== "" ? START_MODES.multiplayer : START_MODES.solo,
  );
  const botCountId = useId();
  const difficultyId = useId();
  const gameModeId = useId();

  const handleBotCountChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setBotCount(clampBotCount(Number(event.target.value)));
  };

  const handleDifficultyChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ): void => {
    if (!isBotDifficulty(event.target.value)) return;
    setDifficulty(event.target.value);
  };

  const handleGameModeChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ): void => {
    const selected = GAME_MODES.find(
      (candidate) => candidate === event.target.value,
    );
    if (selected === undefined) return;
    setGameMode(selected);
  };

  const handlePlay = (): void => {
    sessionController.unlockAudio();
    onStart({
      botCount,
      botDifficulty: difficulty,
      gameMode,
      matchSeconds: gameConfig.matchSeconds,
      seed: createSeed(),
    });
  };

  return (
    <div className="start-screen">
      <h1 className="start-title">AsphaltCrash</h1>
      <div className="start-form">
        <ModeSwitch mode={mode} onChange={setMode} />
        {mode === START_MODES.solo ? (
          <>
            <div className="start-field">
              <label htmlFor={gameModeId}>Game mode</label>
              <select
                id={gameModeId}
                className="start-select"
                value={gameMode}
                onChange={handleGameModeChange}
              >
                {GAME_MODES.map((option) => (
                  <option key={option} value={option}>
                    {GAME_MODE_LABELS[option]}
                  </option>
                ))}
              </select>
              {gameMode === "crashfest" ? (
                <p>No timer, cash, bases, or respawns. Last car wins.</p>
              ) : null}
            </div>
            <div className="start-field">
              <label htmlFor={botCountId}>Bots: {botCount}</label>
              <input
                id={botCountId}
                type="range"
                min={MIN_BOTS}
                max={MAX_BOTS}
                step={1}
                value={botCount}
                onChange={handleBotCountChange}
              />
            </div>
            <div className="start-field">
              <label htmlFor={difficultyId}>Difficulty</label>
              <select
                id={difficultyId}
                className="start-select"
                value={difficulty}
                onChange={handleDifficultyChange}
              >
                {BOT_DIFFICULTIES.map((level) => (
                  <option key={level} value={level}>
                    {DIFFICULTY_LABELS[level]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={handlePlay}
            >
              {gameMode === "crashfest" ? "Play Crashfest" : "Play vs CPU"}
            </button>
          </>
        ) : (
          <MultiplayerPanel initialJoinCode={joinLinkCode} />
        )}
      </div>
    </div>
  );
}
