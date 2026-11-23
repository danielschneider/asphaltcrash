import { useEffect, useRef } from "react";
import { JoystickPad } from "../controls/JoystickPad";
import { RotateHint } from "../controls/RotateHint";
import { useKeyboardInput } from "../../hooks/useKeyboardInput";
import { useOrientationPause } from "../../hooks/useOrientationPause";
import { useSession } from "../../hooks/useSession";
import {
  SESSION_STATE,
  sessionController,
  type SoloMatchOptions,
} from "../../session/SessionController";
import { Hud } from "./Hud";

interface MatchScreenProps {
  readonly options: SoloMatchOptions;
  readonly onExit: () => void;
}

function handleStartError(error: unknown): void {
  console.error("Failed to start solo match", error);
}

export function MatchScreen({ options, onExit }: MatchScreenProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sessionState = useSession();
  const isPortrait = useOrientationPause();
  const inputBuffer = sessionController.getInputBuffer();

  useKeyboardInput(inputBuffer);

  useEffect(() => {
    const host = surfaceRef.current;
    if (!host) return;
    sessionController.startSolo(options, host).catch(handleStartError);
    return () => {
      if (sessionController.getState() === SESSION_STATE.ended) return;
      sessionController.backToIdle();
    };
  }, [options]);

  useEffect(() => {
    sessionController.setPaused(isPortrait);
  }, [isPortrait, sessionState]);

  const handleBack = (): void => {
    onExit();
  };

  return (
    <div className="match-screen">
      <div ref={surfaceRef} className="game-surface" />
      <Hud />
      <JoystickPad inputBuffer={inputBuffer} />
      <button type="button" className="match-back" onClick={handleBack}>
        Exit
      </button>
      <RotateHint />
    </div>
  );
}
