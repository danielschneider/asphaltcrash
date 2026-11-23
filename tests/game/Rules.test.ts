import { describe, expect, it } from "vitest";
import { gameConfig } from "../../src/config/gameConfig";
import {
  applyDamage,
  attributeKill,
  canDeliver,
  canPickUp,
  humanDamageTakenMultiplier,
  isContactOnCooldown,
  isWithinAttribution,
  nextSpawnTick,
  ticksFromMs,
  wallDamageMultiplier,
  wallFrontImpact,
} from "../../src/game/Rules";

describe("humanDamageTakenMultiplier", () => {
  it("scales human damage per difficulty", () => {
    expect(humanDamageTakenMultiplier("easy", true)).toBeCloseTo(0.4);
    expect(humanDamageTakenMultiplier("normal", true)).toBeCloseTo(0.6);
    expect(humanDamageTakenMultiplier("hard", true)).toBeCloseTo(1);
  });

  it("never scales bot damage", () => {
    expect(humanDamageTakenMultiplier("easy", false)).toBe(1);
    expect(humanDamageTakenMultiplier("normal", false)).toBe(1);
    expect(humanDamageTakenMultiplier("hard", false)).toBe(1);
  });
});

const damageConfig = {
  damageThresholdImpulse: gameConfig.damageThresholdImpulse,
  damageFactor: gameConfig.damageFactor,
  maxDamagePerHit: gameConfig.maxDamagePerHit,
};

describe("applyDamage", () => {
  it("returns 0 at or below the threshold", () => {
    expect(applyDamage(0.5, damageConfig)).toBe(0);
    expect(applyDamage(gameConfig.damageThresholdImpulse, damageConfig)).toBe(
      0,
    );
  });

  it("scales the excess above the threshold by the factor", () => {
    const impulse = gameConfig.damageThresholdImpulse + 1;
    expect(applyDamage(impulse, damageConfig)).toBeCloseTo(
      gameConfig.damageFactor,
    );
  });

  it("clamps to maxDamagePerHit", () => {
    expect(applyDamage(1000, damageConfig)).toBe(gameConfig.maxDamagePerHit);
    expect(gameConfig.maxDamagePerHit).toBe(40);
  });

  it("returns 0 for negative, NaN and infinite input", () => {
    expect(applyDamage(-5, damageConfig)).toBe(0);
    expect(applyDamage(Number.NaN, damageConfig)).toBe(0);
    expect(applyDamage(Number.POSITIVE_INFINITY, damageConfig)).toBe(0);
  });
});

describe("wall damage direction", () => {
  it("scales damage fully at the front and cheaply at the side or rear", () => {
    expect(wallDamageMultiplier(1)).toBe(1);
    expect(wallDamageMultiplier(0)).toBe(gameConfig.wallSideDamageMultiplier);
    expect(wallDamageMultiplier(-1)).toBe(gameConfig.wallSideDamageMultiplier);
  });

  it("recognizes front, side and rear contacts from the wall normal", () => {
    const rightWallToCar = { x: -1, y: 0 };
    expect(wallFrontImpact(0, rightWallToCar)).toBe(1);
    expect(wallFrontImpact(Math.PI / 2, rightWallToCar)).toBeCloseTo(0, 10);
    expect(wallFrontImpact(Math.PI, rightWallToCar)).toBe(0);
  });
});

describe("ticksFromMs", () => {
  it("converts contactCooldownMs to 18 ticks", () => {
    expect(ticksFromMs(300)).toBe(18);
    expect(ticksFromMs(gameConfig.contactCooldownMs)).toBe(18);
  });

  it("rounds partial ticks up", () => {
    expect(ticksFromMs(1)).toBe(1);
  });
});

describe("isContactOnCooldown", () => {
  it("is false without a previous contact", () => {
    expect(isContactOnCooldown(undefined, 100)).toBe(false);
  });

  it("is true for ticks 0..17 after contact and false at 18", () => {
    for (let elapsed = 0; elapsed <= 17; elapsed += 1) {
      expect(isContactOnCooldown(0, elapsed)).toBe(true);
    }
    expect(isContactOnCooldown(0, 18)).toBe(false);
  });
});

describe("isWithinAttribution", () => {
  it("uses a 60 tick window (1 s)", () => {
    expect(isWithinAttribution(0, 59)).toBe(true);
    expect(isWithinAttribution(0, 60)).toBe(false);
  });

  it("is false without a hit", () => {
    expect(isWithinAttribution(undefined, 1)).toBe(false);
  });
});

describe("canDeliver", () => {
  it("only allows delivery at the car's own base", () => {
    expect(canDeliver(1, 3, 1)).toBe(true);
    expect(canDeliver(2, 3, 1)).toBe(false);
  });

  it("requires cargo", () => {
    expect(canDeliver(1, 0, 1)).toBe(false);
  });
});

describe("canPickUp", () => {
  it("is true below capacity and false at capacity", () => {
    const capacity = gameConfig.cargoCapacity;
    expect(canPickUp(capacity - 1)).toBe(true);
    expect(canPickUp(capacity)).toBe(false);
  });
});

describe("nextSpawnTick", () => {
  it("adds respawnSeconds in ticks", () => {
    expect(nextSpawnTick(100)).toBe(100 + gameConfig.respawnSeconds * 60);
  });
});

describe("attributeKill", () => {
  it("picks the attacker with the largest impulse inside the window", () => {
    const hits = [
      { attackerPid: 1, tick: 90, impulse: 2 },
      { attackerPid: 2, tick: 95, impulse: 5 },
      { attackerPid: 3, tick: 99, impulse: 4 },
    ];
    expect(attributeKill(hits, 9, 100)).toBe(2);
  });

  it("ignores self hits", () => {
    const hits = [
      { attackerPid: 9, tick: 99, impulse: 10 },
      { attackerPid: 1, tick: 99, impulse: 1 },
    ];
    expect(attributeKill(hits, 9, 100)).toBe(1);
  });

  it("ignores hits outside the attribution window", () => {
    const hits = [{ attackerPid: 1, tick: 0, impulse: 10 }];
    expect(attributeKill(hits, 9, 60)).toBeNull();
  });

  it("returns null when there are no usable hits", () => {
    expect(attributeKill([], 9, 100)).toBeNull();
    expect(
      attributeKill([{ attackerPid: 9, tick: 100, impulse: 3 }], 9, 100),
    ).toBeNull();
  });
});
