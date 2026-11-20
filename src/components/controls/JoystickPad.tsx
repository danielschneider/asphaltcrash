import { useJoystick } from "../../hooks/useJoystick";
import type { InputBuffer } from "../../game/input/InputBuffer";

interface JoystickPadProps {
  readonly inputBuffer: InputBuffer;
}

export function JoystickPad({ inputBuffer }: JoystickPadProps) {
  const {
    padRef,
    knobRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useJoystick(inputBuffer);

  return (
    <div
      ref={padRef}
      className="joystick-pad"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div ref={knobRef} className="joystick-knob" />
    </div>
  );
}
