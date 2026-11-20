import { useState } from "react";
import { StartScreen } from "./components/lobby/StartScreen";
import { MatchScreen } from "./components/hud/MatchScreen";
import { ResultScreen } from "./components/result/ResultScreen";
import { useSession } from "./hooks/useSession";
import {
  SESSION_STATE,
  sessionController,
  type SoloMatchOptions,
} from "./session/SessionController";

export function App() {
  const sessionState = useSession();
  const [soloOptions, setSoloOptions] = useState<SoloMatchOptions | null>(null);

  const handleStart = (options: SoloMatchOptions): void => {
    setSoloOptions(options);
  };

  const handleExit = (): void => {
    sessionController.backToIdle();
    setSoloOptions(null);
  };

  if (sessionState === SESSION_STATE.ended) {
    return (
      <div className="app-root">
        <ResultScreen onBack={handleExit} />
      </div>
    );
  }

  if (soloOptions) {
    return (
      <div className="app-root">
        <MatchScreen options={soloOptions} onExit={handleExit} />
      </div>
    );
  }

  return (
    <div className="app-root">
      <StartScreen onStart={handleStart} />
    </div>
  );
}
