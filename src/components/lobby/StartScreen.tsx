import { useId, useState, type ChangeEvent } from "react";
import { gameConfig } from "../../config/gameConfig";
import { useJoinLinkCode } from "../../hooks/useJoinLinkCode";
import type { BotDifficulty, GameMode } from "../../types/game";
import {
  sessionController,
  type SoloMatchOptions,
} from "../../session/SessionController";
import { Brand } from "../brand/Brand";
import { MultiplayerPanel } from "./MultiplayerPanel";
import { ModeSwitch, START_MODES, type StartMode } from "./ModeSwitch";
import { ChoiceGroup } from "./ChoiceGroup";
import { difficultyOptions, gameModeOptions } from "./lobbyOptions";

interface StartScreenProps {
  readonly onStart: (options: SoloMatchOptions) => void;
}

const MIN_BOTS = 1;
const MAX_BOTS = gameConfig.maxCars - gameConfig.maxHumans;

function clampBotCount(value: number): number {
  if (Number.isNaN(value)) return gameConfig.botDefaultCount;
  return Math.min(MAX_BOTS, Math.max(MIN_BOTS, Math.round(value)));
}

// Intentional non-sim seed source: the seed is only chosen once per match and is then fully reproduced by the sim RNG.
function createSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

// iPadOS Safari only starts audio after a user gesture. The unlock runs synchronously in handlePlay.
export function StartScreen({ onStart }: StartScreenProps) {
  const [botCount, setBotCount] = useState<number>(gameConfig.botDefaultCount);
  const [difficulty, setDifficulty] = useState<BotDifficulty>("normal");
  const [gameMode, setGameMode] = useState<GameMode>("crashfest");
  const joinLinkCode = useJoinLinkCode();
  const [mode, setMode] = useState<StartMode>(
    joinLinkCode !== "" ? START_MODES.multiplayer : START_MODES.solo,
  );
  const botCountId = useId();

  const handleBotCountChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setBotCount(clampBotCount(Number(event.target.value)));
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
    <div className="menu-screen">
      <div className="menu-inner">
        <Brand />
        <div className="menu-card">
          <ModeSwitch mode={mode} onChange={setMode} />
          {mode === START_MODES.solo ? (
            <div className="start-form">
              <ChoiceGroup<GameMode>
                label="Game mode"
                variant="cards"
                options={gameModeOptions}
                value={gameMode}
                onChange={setGameMode}
              />
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
              <ChoiceGroup<BotDifficulty>
                label="Difficulty"
                variant="segmented"
                options={difficultyOptions}
                value={difficulty}
                onChange={setDifficulty}
              />
              <button
                type="button"
                className="button button-primary"
                onClick={handlePlay}
              >
                {gameMode === "crashfest" ? "Play Crashfest" : "Play vs CPU"}
              </button>
            </div>
          ) : (
            <MultiplayerPanel initialJoinCode={joinLinkCode} />
          )}
        </div>
      </div>
    </div>
  );
}
