import { useEffect, useRef } from "react";
import { ActionButton } from "../controls/ActionButton";
import { JoystickPad } from "../controls/JoystickPad";
import { RotateHint } from "../controls/RotateHint";
import { useKeyboardInput } from "../../hooks/useKeyboardInput";
import { sessionController } from "../../session/SessionController";
import { Hud } from "./Hud";

interface NetworkMatchScreenProps {
  readonly onExit: () => void;
}

function handleAttachError(error: unknown): void {
  console.error("Failed to attach match renderer", error);
}

export function NetworkMatchScreen({ onExit }: NetworkMatchScreenProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const inputBuffer = sessionController.getInputBuffer();

  useKeyboardInput(inputBuffer);

  useEffect(() => {
    const host = surfaceRef.current;
    if (!host) return;
    sessionController.attachMatchRenderer(host).catch(handleAttachError);
  }, []);

  return (
    <div className="match-screen">
      <div ref={surfaceRef} className="game-surface" />
      <Hud />
      <JoystickPad inputBuffer={inputBuffer} />
      <ActionButton inputBuffer={inputBuffer} />
      <button type="button" className="match-back" onClick={onExit}>
        Exit
      </button>
      <RotateHint />
    </div>
  );
}
