import type { PointerEvent as ReactPointerEvent } from "react";
import type { InputBuffer } from "../../game/input/InputBuffer";

interface ActionButtonProps {
  readonly inputBuffer: InputBuffer;
}

export function ActionButton({ inputBuffer }: ActionButtonProps) {
  const handlePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    inputBuffer.write({ action: true });
  };

  const handlePointerRelease = (): void => {
    inputBuffer.write({ action: false });
  };

  return (
    <button
      type="button"
      className="action-button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerRelease}
      onPointerLeave={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
    >
      Boost
    </button>
  );
}
