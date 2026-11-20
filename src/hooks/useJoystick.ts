import {
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { gameConfig } from "../config/gameConfig";
import type { InputBuffer } from "../game/input/InputBuffer";

export interface StickState {
  readonly knobX: number;
  readonly knobY: number;
  readonly steer: number;
  readonly throttle: number;
}

export interface JoystickBinding {
  readonly padRef: RefObject<HTMLDivElement | null>;
  readonly knobRef: RefObject<HTMLDivElement | null>;
  readonly handlePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  readonly handlePointerMove: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  readonly handlePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const IDLE_STICK: StickState = { knobX: 0, knobY: 0, steer: 0, throttle: 0 };
const NO_POINTER = -1;

export function resolveStick(
  dx: number,
  dy: number,
  radius: number,
  deadZone: number,
): StickState {
  const length = Math.hypot(dx, dy);
  if (length === 0) return IDLE_STICK;
  const reach = Math.min(length, radius);
  const unitX = dx / length;
  const unitY = dy / length;
  const knobX = unitX * reach;
  const knobY = unitY * reach;
  const magnitude = reach / radius;
  if (magnitude <= deadZone) return { knobX, knobY, steer: 0, throttle: 0 };
  // Dead zone is rescaled so output ramps from 0 at the edge of the zone to 1 at full deflection.
  const strength = (magnitude - deadZone) / (1 - deadZone);
  return { knobX, knobY, steer: unitX * strength, throttle: -unitY * strength };
}

export function useJoystick(inputBuffer: InputBuffer): JoystickBinding {
  const padRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number>(NO_POINTER);
  const centerRef = useRef<Point>({ x: 0, y: 0 });

  const applyStick = (clientX: number, clientY: number): void => {
    const center = centerRef.current;
    const stick = resolveStick(
      clientX - center.x,
      clientY - center.y,
      gameConfig.joystickRadiusPx,
      gameConfig.joystickDeadZone,
    );
    if (knobRef.current) {
      knobRef.current.style.transform = `translate3d(${stick.knobX}px, ${stick.knobY}px, 0)`;
    }
    inputBuffer.write({ steer: stick.steer, throttle: stick.throttle });
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    if (pointerIdRef.current !== NO_POINTER) return;
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    applyStick(event.clientX, event.clientY);
  };

  const handlePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    if (event.pointerId !== pointerIdRef.current) return;
    applyStick(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = NO_POINTER;
    if (knobRef.current) knobRef.current.style.transform = "";
    inputBuffer.write({ steer: 0, throttle: 0 });
  };

  return {
    padRef,
    knobRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
