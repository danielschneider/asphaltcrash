import { useState } from "react";
import { LobbyScreen } from "./components/lobby/LobbyScreen";
import { StartScreen } from "./components/lobby/StartScreen";
import { MatchScreen } from "./components/hud/MatchScreen";
import { NetworkMatchScreen } from "./components/hud/NetworkMatchScreen";
import { ResultScreen } from "./components/result/ResultScreen";
import { useSession } from "./hooks/useSession";
import {
  SESSION_STATE,
  sessionController,
  type SoloMatchOptions,
} from "./session/SessionController";

const LOBBY_STATES: readonly string[] = [
  SESSION_STATE.hostingLobby,
  SESSION_STATE.joinedLobby,
];

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

  if (
    sessionState === SESSION_STATE.ended ||
    sessionState === SESSION_STATE.endedNetwork
  ) {
    return (
      <div className="app-root">
        <ResultScreen onBack={handleExit} />
      </div>
    );
  }

  if (LOBBY_STATES.includes(sessionState)) {
    return (
      <div className="app-root">
        <LobbyScreen />
      </div>
    );
  }

  if (sessionState === SESSION_STATE.playingNetwork) {
    return (
      <div className="app-root">
        <NetworkMatchScreen onExit={handleExit} />
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
