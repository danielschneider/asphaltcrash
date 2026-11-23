// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gameConfig } from "../../../src/config/gameConfig";
import { CarAudio } from "../../../src/game/audio/CarAudio";
import {
  accelGain,
  distanceGain,
  engineFrequencyHz,
  engineGain,
  smoothThrottle,
  speedFractionFromDelta,
  squealGain,
  turnRateRadPerSec,
} from "../../../src/game/audio/audioMath";
import { CAR_FLAG, type CarView } from "../../../src/types/game";

const DT = 1 / 60;

describe("engineFrequencyHz", () => {
  it("rises monotonically with speed and stays within idle..max plus throttle", () => {
    const at0 = engineFrequencyHz(0, 0, gameConfig);
    const at50 = engineFrequencyHz(0.5, 0, gameConfig);
    const at100 = engineFrequencyHz(1, 0, gameConfig);
    expect(at0).toBe(gameConfig.audioEngineIdleHz);
    expect(at50).toBeGreaterThan(at0);
    expect(at100).toBeGreaterThan(at50);
    expect(at100).toBe(gameConfig.audioEngineMaxHz);
  });

  it("rises with throttle and clamps out-of-range inputs", () => {
    expect(engineFrequencyHz(0.2, 1, gameConfig)).toBeGreaterThan(
      engineFrequencyHz(0.2, 0, gameConfig),
    );
    expect(engineFrequencyHz(5, 0, gameConfig)).toBe(
      engineFrequencyHz(1, 0, gameConfig),
    );
    expect(engineFrequencyHz(-3, -1, gameConfig)).toBe(
      gameConfig.audioEngineIdleHz,
    );
  });
});

describe("engineGain", () => {
  it("is above zero at rest so the engine is audible when idle", () => {
    expect(engineGain(0, 0, gameConfig)).toBeGreaterThan(0);
    expect(engineGain(0, 0, gameConfig)).toBe(gameConfig.audioEngineIdleGain);
  });

  it("is bounded to 0..1 and grows with speed and throttle", () => {
    const low = engineGain(0.2, 0.2, gameConfig);
    const high = engineGain(1, 1, gameConfig);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
    expect(engineGain(9, 9, gameConfig)).toBeLessThanOrEqual(1);
  });
});

describe("accelGain", () => {
  it("is zero at or below the throttle threshold", () => {
    expect(accelGain(0, gameConfig)).toBe(0);
    expect(accelGain(gameConfig.audioAccelThreshold, gameConfig)).toBe(0);
  });

  it("reaches the max gain at full throttle", () => {
    expect(accelGain(1, gameConfig)).toBeCloseTo(gameConfig.audioAccelMaxGain);
    expect(accelGain(0.8, gameConfig)).toBeGreaterThan(0);
    expect(accelGain(0.8, gameConfig)).toBeLessThan(
      gameConfig.audioAccelMaxGain,
    );
  });
});

describe("squealGain", () => {
  it("is zero below the turn threshold", () => {
    expect(
      squealGain(gameConfig.audioSqueakTurnRate * 0.5, 1, gameConfig),
    ).toBe(0);
  });

  it("is zero at low speed even for a sharp turn", () => {
    expect(squealGain(gameConfig.audioSqueakFullTurnRate, 0, gameConfig)).toBe(
      0,
    );
    expect(
      squealGain(
        gameConfig.audioSqueakFullTurnRate,
        gameConfig.audioSqueakMinSpeedFraction * 0.5,
        gameConfig,
      ),
    ).toBe(0);
  });

  it("is monotonic in turn rate and bounded by the max gain", () => {
    const rates = [1.6, 2, 2.5, 3, 4, 10];
    const gains = rates.map((rate) => squealGain(rate, 1, gameConfig));
    for (let i = 1; i < gains.length; i += 1) {
      expect(gains[i]).toBeGreaterThanOrEqual(gains[i - 1] ?? 0);
    }
    for (const gain of gains) {
      expect(gain).toBeLessThanOrEqual(gameConfig.audioSqueakMaxGain);
    }
    expect(squealGain(-3, 1, gameConfig)).toBe(squealGain(3, 1, gameConfig));
  });

  it("ignores non-finite turn rates", () => {
    expect(squealGain(Number.NaN, 1, gameConfig)).toBe(0);
  });
});

describe("distanceGain", () => {
  it("is 1 at zero distance, 0 at the radius and linear in between", () => {
    const radius = gameConfig.audioHearingRadiusPx;
    expect(distanceGain(0, gameConfig)).toBe(1);
    expect(distanceGain(radius, gameConfig)).toBe(0);
    expect(distanceGain(radius * 2, gameConfig)).toBe(0);
    expect(distanceGain(radius / 2, gameConfig)).toBeCloseTo(0.5);
  });
});

describe("turnRateRadPerSec", () => {
  it("takes the shortest arc across +-pi", () => {
    const rate = turnRateRadPerSec(Math.PI - 0.05, -Math.PI + 0.05, 0.1);
    expect(rate).toBeCloseTo(1);
    expect(turnRateRadPerSec(-Math.PI + 0.05, Math.PI - 0.05, 0.1)).toBeCloseTo(
      -1,
    );
  });

  it("gives 0 for dt <= 0 or non-finite dt", () => {
    expect(turnRateRadPerSec(0, 1, 0)).toBe(0);
    expect(turnRateRadPerSec(0, 1, -1)).toBe(0);
    expect(turnRateRadPerSec(0, 1, Number.NaN)).toBe(0);
  });
});

describe("speedFractionFromDelta", () => {
  it("converts a position delta into a clamped speed fraction", () => {
    const max = gameConfig.maxForwardSpeed;
    expect(speedFractionFromDelta(max * DT, 0, DT, max)).toBeCloseTo(1);
    expect(speedFractionFromDelta(max * DT * 4, 0, DT, max)).toBe(1);
    expect(speedFractionFromDelta(0, 0, DT, max)).toBe(0);
    expect(speedFractionFromDelta(10, 0, 0, max)).toBe(0);
  });
});

describe("smoothThrottle", () => {
  it("ramps up fast and ramps down slower when throttle is released", () => {
    const up = smoothThrottle(0, 1, DT, gameConfig);
    const down = smoothThrottle(1, 0, DT, gameConfig);
    expect(1 - down).toBeLessThan(up);
    expect(down).toBeGreaterThan(0);
  });

  it("takes about the configured release time to fall to 1/e", () => {
    let value = 1;
    const seconds = gameConfig.audioThrottleReleaseSeconds;
    for (let t = 0; t < seconds; t += DT) {
      value = smoothThrottle(value, 0, DT, gameConfig);
    }
    expect(value).toBeCloseTo(Math.exp(-1), 1);
  });

  it("keeps the current value for non-positive dt", () => {
    expect(smoothThrottle(0.4, 1, 0, gameConfig)).toBeCloseTo(0.4);
  });
});

describe("CarAudio without AudioContext", () => {
  const scope = globalThis as unknown as { AudioContext?: unknown };
  let saved: unknown;

  beforeEach(() => {
    saved = scope.AudioContext;
    scope.AudioContext = undefined;
  });

  afterEach(() => {
    scope.AudioContext = saved;
  });

  it("is a no-op: unlock, update, setMuted and dispose do not throw", () => {
    const audio = new CarAudio();
    const cars: readonly CarView[] = [
      {
        pid: 0,
        x: 0,
        y: 0,
        angle: 0,
        hp: 100,
        flags: CAR_FLAG.boosting,
        cargo: 0,
        isLocal: true,
        name: "",
      },
      {
        pid: 1,
        x: 100,
        y: 0,
        angle: 0,
        hp: 100,
        flags: 0,
        cargo: 0,
        isLocal: false,
        name: "",
      },
    ];
    expect(() => {
      audio.unlock();
      audio.setMuted(true);
      audio.update(cars, 0, DT);
      audio.update(cars, 0, DT);
      audio.dispose();
    }).not.toThrow();
  });
});
