import { useEffect } from "react";
import type { InputBuffer } from "../game/input/InputBuffer";

type HeldKey = "up" | "down" | "left" | "right" | "action";

// Desktop stand-in for touch controls. Writes only to InputBuffer, never to the simulation.
const KEY_ROLES: Partial<Record<string, HeldKey>> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "action",
};

function axis(
  held: ReadonlySet<HeldKey>,
  positive: HeldKey,
  negative: HeldKey,
): number {
  return (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);
}

export function useKeyboardInput(inputBuffer: InputBuffer): void {
  useEffect(() => {
    const held = new Set<HeldKey>();

    const syncBuffer = (): void => {
      inputBuffer.write({
        throttle: axis(held, "up", "down"),
        steer: axis(held, "right", "left"),
        action: held.has("action"),
      });
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      const role = KEY_ROLES[event.code];
      if (!role) return;
      event.preventDefault();
      held.add(role);
      syncBuffer();
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      const role = KEY_ROLES[event.code];
      if (!role) return;
      held.delete(role);
      syncBuffer();
    };

    const handleBlur = (): void => {
      held.clear();
      syncBuffer();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [inputBuffer]);
}
