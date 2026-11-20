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
  readonly zoneRef: RefObject<HTMLDivElement | null>;
  readonly baseRef: RefObject<HTMLDivElement | null>;
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
  steerDeadZone: number,
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
  const dominantAxis = Math.max(Math.abs(unitX), Math.abs(unitY));
  const rawSteer = (unitX / dominantAxis) * strength;
  const steerMagnitude = Math.abs(rawSteer);
  return {
    knobX,
    knobY,
    steer:
      steerMagnitude <= steerDeadZone
        ? 0
        : (Math.sign(rawSteer) * (steerMagnitude - steerDeadZone)) /
          (1 - steerDeadZone),
    throttle: (-unitY / dominantAxis) * strength,
  };
}

export function useJoystick(inputBuffer: InputBuffer): JoystickBinding {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
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
      gameConfig.joystickSteerDeadZone,
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
    centerRef.current = { x: event.clientX, y: event.clientY };
    const zoneRect = event.currentTarget.getBoundingClientRect();
    if (baseRef.current) {
      const offsetX =
        event.clientX - zoneRect.left - gameConfig.joystickRadiusPx;
      const offsetY =
        event.clientY - zoneRect.top - gameConfig.joystickRadiusPx;
      baseRef.current.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
      baseRef.current.style.opacity = "1";
    }
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
    if (baseRef.current) baseRef.current.style.opacity = "0";
    inputBuffer.write({ steer: 0, throttle: 0 });
  };

  return {
    zoneRef,
    baseRef,
    knobRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
