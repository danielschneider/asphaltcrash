import { describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import { CAR_FLAG } from "../../../src/types/game";
import {
  carFlags,
  createCarState,
  isInvulnerable,
  recordHit,
} from "../../../src/game/sim/CarState";
import { secondsToTicks } from "../../../src/game/sim/time";

const ATTRIBUTION_TICKS = secondsToTicks(gameConfig.attributionWindowSeconds);

describe("createCarState", () => {
  it("starts healthy, idle and without cargo or hits", () => {
    const car = createCarState(2, 100);
    expect(car).toMatchObject({
      pid: 2,
      hp: 100,
      destroyed: false,
      carried: [],
      hits: [],
      boosting: false,
    });
  });
});

describe("carFlags", () => {
  it("returns 0 for a plain car", () => {
    expect(carFlags(createCarState(0, 100))).toBe(0);
  });

  it("sets destroyed and respawning together", () => {
    const car = { ...createCarState(0, 100), destroyed: true };
    expect(carFlags(car)).toBe(CAR_FLAG.destroyed | CAR_FLAG.respawning);
  });

  it("sets boosting, braking and carrying independently", () => {
    const car = {
      ...createCarState(0, 100),
      boosting: true,
      throttle: -1,
      carried: [10 as const],
    };
    expect(carFlags(car)).toBe(
      CAR_FLAG.boosting | CAR_FLAG.braking | CAR_FLAG.carrying,
    );
  });

  it("does not set braking for forward throttle", () => {
    expect(
      carFlags({ ...createCarState(0, 100), throttle: 1 }) & CAR_FLAG.braking,
    ).toBe(0);
  });
});

describe("recordHit", () => {
  it("prunes hits older than the attribution window", () => {
    const car = createCarState(0, 100);
    recordHit(car, { attackerPid: 1, tick: 0, impulse: 1 }, 0);
    const later = ATTRIBUTION_TICKS + 1;
    recordHit(car, { attackerPid: 2, tick: later, impulse: 1 }, later);
    expect(car.hits.map((hit) => hit.attackerPid)).toEqual([2]);
  });

  it("keeps hits inside the attribution window", () => {
    const car = createCarState(0, 100);
    recordHit(car, { attackerPid: 1, tick: 10, impulse: 1 }, 10);
    recordHit(car, { attackerPid: 2, tick: 20, impulse: 2 }, 20);
    expect(car.hits).toHaveLength(2);
  });
});

describe("isInvulnerable", () => {
  it("is true strictly before invulnerableUntilTick", () => {
    const car = { ...createCarState(0, 100), invulnerableUntilTick: 50 };
    expect(isInvulnerable(car, 49)).toBe(true);
    expect(isInvulnerable(car, 50)).toBe(false);
  });
});
