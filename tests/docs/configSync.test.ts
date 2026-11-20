// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { gameConfig } from "../../src/config/gameConfig";

// Technical or physics values in gameConfig that are not yet listed in GAMEPLAY section 9.
// Entries ending in "*" match any key with that prefix.
export const TECHNICAL_CONFIG_ALLOWLIST: readonly string[] = [
  "fixedStepHz",
  "maxFrameDeltaMs",
  "hudHz",
  "visualSeed",
  "botSeedStride",
  "billPlacementAttempts",
  "timerWarningSeconds",
  "arena*",
  "wall*",
  "car*",
  "base*",
  "billMinDistanceFromBase",
  "billValues",
  "billWeightsPct",
  "humanSpawns",
  "botSpawns",
  "maxForwardSpeed",
  "maxReverseSpeed",
  "acceleration",
  "braking",
  "lateralGrip",
  "airFriction",
  "boostSpeedBonus",
  "steerRateRadPerSec",
  "steerSpeedPenalty",
  "joystickRadiusPx",
  "joystickDeadZone",
  "botDefaultCount",
  "botProfiles",
  "playerColors",
  "hitEventThreshold",
  "cameraShakePx",
  "cameraShakeMs",
  "botAttackRadiusPx",
  "botEvadeRadiusPx",
];

const GAMEPLAY_DOC_PATH = fileURLToPath(
  new URL("../../docs/GAMEPLAY.md", import.meta.url),
);
const TABLE_ROW_KEY = /^\|\s*`([A-Za-z_]\w*)`\s*\|/gm;

function readSection9Keys(): string[] {
  const doc = readFileSync(GAMEPLAY_DOC_PATH, "utf8");
  const start = doc.indexOf("## 9.");
  const end = doc.indexOf("## 10.", start);
  if (start < 0 || end < 0) throw new Error("GAMEPLAY section 9 not found");
  const section = doc.slice(start, end);
  return [...section.matchAll(TABLE_ROW_KEY)].map((match) => match[1] ?? "");
}

function matchesAllowEntry(key: string, entry: string): boolean {
  if (entry.endsWith("*")) return key.startsWith(entry.slice(0, -1));
  return key === entry;
}

const configKeys: readonly string[] = Object.keys(gameConfig);
const docKeys = readSection9Keys();

describe("GAMEPLAY section 9 <-> gameConfig", () => {
  it("parses a non-empty key table from GAMEPLAY section 9", () => {
    expect(docKeys.length).toBeGreaterThan(10);
  });

  it("every documented key exists in gameConfig", () => {
    const missing = docKeys.filter((key) => !configKeys.includes(key));
    expect(missing).toEqual([]);
  });

  it("every gameConfig key is documented or allowlisted", () => {
    const undocumented = configKeys.filter(
      (key) =>
        !docKeys.includes(key) &&
        !TECHNICAL_CONFIG_ALLOWLIST.some((entry) =>
          matchesAllowEntry(key, entry),
        ),
    );
    expect(undocumented).toEqual([]);
  });

  it("every allowlist entry matches at least one gameConfig key (no stale entries)", () => {
    const stale = TECHNICAL_CONFIG_ALLOWLIST.filter(
      (entry) => !configKeys.some((key) => matchesAllowEntry(key, entry)),
    );
    expect(stale).toEqual([]);
  });
});
