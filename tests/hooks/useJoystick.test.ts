// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { JoystickPad } from "../../src/components/controls/JoystickPad";
import { InputBuffer } from "../../src/game/input/InputBuffer";
import { resolveStick } from "../../src/hooks/useJoystick";

describe("resolveStick", () => {
  it("aims along the stick direction on a diagonal", () => {
    const component = 72 / Math.sqrt(2);
    const stick = resolveStick(component, -component, 72, 0.12);

    expect(stick.aimX).toBeCloseTo(Math.SQRT1_2);
    expect(stick.aimY).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.hypot(stick.aimX, stick.aimY)).toBeCloseTo(1);
  });

  it("keeps small movements inside the dead zone neutral", () => {
    const stick = resolveStick(4, 4, 72, 0.12);

    expect(stick.aimX).toBe(0);
    expect(stick.aimY).toBe(0);
  });

  it("points straight up for a full upward deflection", () => {
    const stick = resolveStick(0, -72, 72, 0.12);

    expect(stick.aimX).toBeCloseTo(0);
    expect(stick.aimY).toBeCloseTo(-1);
  });

  it("ramps magnitude from the dead zone edge to full deflection", () => {
    const stick = resolveStick(0, -18, 72, 0.12);

    expect(Math.abs(stick.aimY)).toBeCloseTo((0.25 - 0.12) / (1 - 0.12));
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
    expect(inputBuffer.latest().aimX).toBeGreaterThan(0);
    expect(inputBuffer.latest().aimY).toBeLessThan(0);

    fireEvent.pointerUp(zone, { pointerId: 1 });
    expect(inputBuffer.latest().aimX).toBe(0);
    expect(inputBuffer.latest().aimY).toBe(0);
    expect(base.style.opacity).toBe("0");
  });
});
