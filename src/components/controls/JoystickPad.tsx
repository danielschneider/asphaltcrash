import { useJoystick } from "../../hooks/useJoystick";
import type { InputBuffer } from "../../game/input/InputBuffer";

interface JoystickPadProps {
  readonly inputBuffer: InputBuffer;
}

export function JoystickPad({ inputBuffer }: JoystickPadProps) {
  const {
    zoneRef,
    baseRef,
    knobRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useJoystick(inputBuffer);

  return (
    <div
      ref={zoneRef}
      className="joystick-zone"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div ref={baseRef} className="joystick-base">
        <div ref={knobRef} className="joystick-knob" />
      </div>
    </div>
  );
}
