// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { JoystickPad } from "../../src/components/controls/JoystickPad";
import { InputBuffer } from "../../src/game/input/InputBuffer";
import { resolveStick } from "../../src/hooks/useJoystick";

describe("resolveStick", () => {
  it("allows full steering and throttle together on a diagonal", () => {
    const component = 72 / Math.sqrt(2);
    const stick = resolveStick(component, -component, 72, 0.12);

    expect(stick.steer).toBeCloseTo(1);
    expect(stick.throttle).toBeCloseTo(1);
  });

  it("keeps small movements inside the dead zone neutral", () => {
    const stick = resolveStick(4, 4, 72, 0.12);

    expect(stick.steer).toBe(0);
    expect(stick.throttle).toBe(0);
  });
});

describe("JoystickPad", () => {
  afterEach(() => {
    cleanup();
  });

  it("anchors the stick at the touch and clears input when released", () => {
    const inputBuffer = new InputBuffer();
    const { container } = render(createElement(JoystickPad, { inputBuffer }));
    const zone = container.querySelector(".joystick-zone");
    const base = container.querySelector(".joystick-base");
    if (
      !(zone instanceof HTMLDivElement) ||
      !(base instanceof HTMLDivElement)
    ) {
      throw new Error("Joystick elements are missing");
    }

    vi.spyOn(zone, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 500, 500),
    );
    Object.defineProperty(zone, "setPointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 150, clientY: 180 });

    expect(base.style.transform).toBe("translate3d(78px, 108px, 0px)");
    expect(base.style.opacity).toBe("1");

    fireEvent.pointerMove(zone, { pointerId: 1, clientX: 201, clientY: 129 });
    expect(inputBuffer.latest().steer).toBeCloseTo(1);
    expect(inputBuffer.latest().throttle).toBeCloseTo(1);

    fireEvent.pointerUp(zone, { pointerId: 1 });
    expect(inputBuffer.latest().steer).toBe(0);
    expect(inputBuffer.latest().throttle).toBe(0);
    expect(base.style.opacity).toBe("0");
  });
});
