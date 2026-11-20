// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateHello } from "../../src/network/protocol/validate";
import { RosterHandshakeHost } from "../../src/network/session/RosterHandshakeHost";
import {
  PLAYER_NAME_ADJECTIVES,
  PLAYER_NAME_ANIMALS,
  PLAYER_NAME_MAX_LENGTH,
  generatePlayerName,
  generateUniquePlayerName,
  type RandomIndex,
} from "../../src/session/playerNames";

const TOKEN = "abcdefghij123456";
const NAME_FORMAT = /^[A-Z][a-z]+(-[A-Z][a-z]+)?-\d{2}$/;
const MODULE_SOURCE = readFileSync(
  resolve(
    fileURLToPath(new URL("../..", import.meta.url)),
    "src/session/playerNames.ts",
  ),
  "utf8",
);

function indexSource(indices: readonly number[]): RandomIndex {
  let cursor = 0;
  return (max) => {
    const value = indices[cursor % indices.length] ?? 0;
    cursor += 1;
    return value % max;
  };
}

// Draw order: adjective, animal, number index (0..89 -> 10..99).
function fixedIndex(
  adjective: number,
  animal: number,
  number = 0,
): RandomIndex {
  return indexSource([adjective, animal, number]);
}

function adjectiveIndex(word: string): number {
  return PLAYER_NAME_ADJECTIVES.indexOf(
    word as (typeof PLAYER_NAME_ADJECTIVES)[number],
  );
}

function animalIndex(word: string): number {
  return PLAYER_NAME_ANIMALS.indexOf(
    word as (typeof PLAYER_NAME_ANIMALS)[number],
  );
}

function hello(name: unknown): unknown {
  return { v: 1, t: "hello", name, token: TOKEN };
}

describe("playerNames", () => {
  it("passes validateHello and stays within 16 chars for every combination", () => {
    for (let a = 0; a < PLAYER_NAME_ADJECTIVES.length; a += 1) {
      for (let n = 0; n < PLAYER_NAME_ANIMALS.length; n += 1) {
        for (let num = 0; num < 90; num += 9) {
          const name = generatePlayerName(fixedIndex(a, n, num));
          expect(name.length).toBeLessThanOrEqual(PLAYER_NAME_MAX_LENGTH);
          expect(name).toMatch(NAME_FORMAT);
          expect(validateHello(hello(name)).ok).toBe(true);
        }
      }
    }
  });

  it("drops the adjective when '<Adjective>-<Animal>-<NN>' exceeds 16 chars", () => {
    const name = generatePlayerName(
      fixedIndex(adjectiveIndex("legendary"), animalIndex("squirrel"), 0),
    );
    expect(name).toBe("Squirrel-10");
  });

  it("uses the full '<Adjective>-<Animal>-<NN>' form when it fits", () => {
    const name = generatePlayerName(
      fixedIndex(adjectiveIndex("super"), animalIndex("cat"), 32),
    );
    expect(name).toBe("Super-Cat-42");
    expect(name.length).toBeLessThanOrEqual(PLAYER_NAME_MAX_LENGTH);
  });

  it("always uses a two-digit number in 10..99", () => {
    expect(generatePlayerName(fixedIndex(0, 0, 0))).toMatch(/-10$/);
    expect(generatePlayerName(fixedIndex(0, 0, 89))).toMatch(/-99$/);
    for (let n = 0; n < 90; n += 1) {
      expect(generatePlayerName(fixedIndex(0, 0, n))).toMatch(/-\d{2}$/);
    }
  });

  it("is deterministic for a fixed index source", () => {
    expect(generatePlayerName(indexSource([3, 1, 7]))).toBe(
      generatePlayerName(indexSource([3, 1, 7])),
    );
  });

  it("never returns a taken name when there is room", () => {
    const taken = new Set<string>();
    const source = indexSource([0, 0, 0]);
    for (let i = 0; i < 10; i += 1) {
      const name = generateUniquePlayerName(taken, source);
      expect(taken.has(name.toLowerCase())).toBe(false);
      expect(validateHello(hello(name)).ok).toBe(true);
      taken.add(name.toLowerCase());
    }
  });

  it("re-draws the number on collision", () => {
    const taken = new Set(["super-cat-10"]);
    const name = generateUniquePlayerName(
      taken,
      indexSource([3, 3, 0, 3, 3, 1]),
      3,
    );
    expect(name).toBe("Super-Cat-11");
  });

  it("falls back to '<Animal>-<NN>' counter after maxAttempts collisions", () => {
    const taken = new Set(["super-cat-13", "cat-10"]);
    const name = generateUniquePlayerName(taken, () => 3, 1);
    expect(name).toBe("Cat-11");
    expect(name.length).toBeLessThanOrEqual(PLAYER_NAME_MAX_LENGTH);
    expect(validateHello(hello(name)).ok).toBe(true);
  });

  it("fallback counter stays two-digit and within 16 chars", () => {
    const taken = new Set([
      "awesome-squirrel-10",
      "squirrel-10",
      "squirrel-11",
      "squirrel-12",
    ]);
    const name = generateUniquePlayerName(taken, () => 0, 1);
    expect(name).toBe("Squirrel-13");
    expect(name.length).toBeLessThanOrEqual(PLAYER_NAME_MAX_LENGTH);
    expect(validateHello(hello(name)).ok).toBe(true);
  });

  it("uses no Math.random", () => {
    expect(MODULE_SOURCE).not.toContain("Math.random");
  });
});

describe("RosterHandshakeHost name assignment", () => {
  it("replaces an invalid client name with a generated unique name", () => {
    const rosters: (readonly { name: string }[])[] = [];
    const host = new RosterHandshakeHost(
      { pid: 0, name: "Awesome-Squirrel" },
      (players) => rosters.push(players),
      (taken) => generateUniquePlayerName(taken, indexSource([0, 0, 0])),
    );
    const reply = host.onHello("peer-a", hello("   "));
    expect(reply.t).toBe("welcome");
    const latest = rosters.at(-1)?.[1]?.name;
    expect(latest).toBe("Squirrel-10");
  });

  it("keeps a valid client name unchanged", () => {
    const rosters: (readonly { name: string }[])[] = [];
    const host = new RosterHandshakeHost(
      { pid: 0, name: "Host" },
      (players) => rosters.push(players),
      () => "Never",
    );
    host.onHello("peer-a", hello("Carla"));
    expect(rosters.at(-1)?.[1]?.name).toBe("Carla");
  });

  it("still rejects a hello with a bad token", () => {
    const host = new RosterHandshakeHost(
      { pid: 0, name: "Host" },
      () => undefined,
      () => "Never",
    );
    const reply = host.onHello("peer-a", {
      v: 1,
      t: "hello",
      name: "",
      token: "short",
    });
    expect(reply).toEqual({ v: 1, t: "reject", reason: "invalid" });
  });
});
