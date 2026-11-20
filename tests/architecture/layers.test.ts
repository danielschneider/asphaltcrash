// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SRC_ROOT = join(REPO_ROOT, "src");
const SOURCE_EXTENSION = /\.(ts|tsx)$/;
const STATIC_IMPORT = /\bfrom\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']/g;

interface LayerRule {
  readonly name: string;
  readonly matches: (relPath: string) => boolean;
  readonly forbiddenPackages: readonly string[];
  readonly forbiddenPaths: readonly string[];
}

const REACT = ["react", "react-dom"] as const;
const PIXI = ["pixi.js"] as const;
const MATTER = ["matter-js"] as const;
const PEER = ["peerjs"] as const;
const NETWORK_PATH = "src/network/";
const COMPONENTS_PATH = "src/components/";
const SIM_PATHS = ["src/game/sim/", "src/game/Engine.ts"] as const;

const L2_EXACT = [
  "src/game/Entities.ts",
  "src/game/Rules.ts",
  "src/game/WorldView.ts",
];
const L2_PREFIXES = [
  "src/game/sim/",
  "src/game/bots/",
  "src/types/",
  "src/config/",
];
const L0_FILES = [
  "src/game/Renderer.ts",
  "src/game/Effects.ts",
  "src/game/Camera.ts",
];
const L3_FILES = ["src/game/Engine.ts"];
const L3_PREFIXES = ["src/game/input/", "src/game/shadow/"];
const UI_EXACT = ["src/App.tsx", "src/main.tsx"];
const UI_PREFIXES = ["src/components/", "src/hooks/"];

const LAYER_RULES: readonly LayerRule[] = [
  {
    name: "L2 domain",
    matches: (p) =>
      L2_EXACT.includes(p) || L2_PREFIXES.some((x) => p.startsWith(x)),
    forbiddenPackages: [...REACT, ...PIXI, ...MATTER, ...PEER],
    forbiddenPaths: [NETWORK_PATH, COMPONENTS_PATH],
  },
  {
    name: "physics adapter",
    matches: (p) => p === "src/game/Physics.ts",
    forbiddenPackages: [...REACT, ...PIXI, ...PEER],
    forbiddenPaths: [NETWORK_PATH, COMPONENTS_PATH],
  },
  {
    name: "L0 renderer",
    matches: (p) => L0_FILES.includes(p),
    forbiddenPackages: [...REACT, ...MATTER, ...PEER],
    forbiddenPaths: [NETWORK_PATH, COMPONENTS_PATH],
  },
  {
    name: "L3 runtime",
    matches: (p) =>
      L3_FILES.includes(p) || L3_PREFIXES.some((x) => p.startsWith(x)),
    forbiddenPackages: [...REACT, ...PIXI, ...MATTER, ...PEER],
    forbiddenPaths: [COMPONENTS_PATH],
  },
  {
    name: "L4 session",
    matches: (p) => p.startsWith("src/session/"),
    forbiddenPackages: [...PIXI, ...MATTER, ...PEER],
    forbiddenPaths: [],
  },
  {
    name: "L1 network",
    matches: (p) => p.startsWith(NETWORK_PATH),
    forbiddenPackages: [...REACT, ...PIXI, ...MATTER],
    forbiddenPaths: [COMPONENTS_PATH],
  },
  {
    name: "L5 UI",
    matches: (p) =>
      UI_EXACT.includes(p) || UI_PREFIXES.some((x) => p.startsWith(x)),
    forbiddenPackages: [...MATTER, ...PEER],
    forbiddenPaths: [...SIM_PATHS],
  },
];

interface Violation {
  readonly file: string;
  readonly specifier: string;
  readonly layer: string;
  readonly reason: string;
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return SOURCE_EXTENSION.test(entry) ? [full] : [];
  });
}

function toRepoPath(absPath: string): string {
  return relative(REPO_ROOT, absPath).split(sep).join(posix.sep);
}

function extractSpecifiers(source: string): string[] {
  return [STATIC_IMPORT, DYNAMIC_IMPORT].flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1] ?? ""),
  );
}

function isPackageSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/");
}

function resolveInternal(fromFile: string, specifier: string): string {
  const target = resolve(dirname(fromFile), specifier);
  return toRepoPath(target).replace(/\.(ts|tsx)$/, "");
}

function isForbiddenPackage(specifier: string, pkg: string): boolean {
  return specifier === pkg || specifier.startsWith(`${pkg}/`);
}

function hasForbiddenPath(resolved: string, forbidden: string): boolean {
  if (forbidden.endsWith("/")) return resolved.startsWith(forbidden);
  return resolved === forbidden.replace(/\.(ts|tsx)$/, "");
}

function checkImport(
  file: string,
  specifier: string,
  rule: LayerRule,
): string | null {
  if (isPackageSpecifier(specifier)) {
    const hit = rule.forbiddenPackages.find((pkg) =>
      isForbiddenPackage(specifier, pkg),
    );
    return hit ? `forbidden package ${hit}` : null;
  }
  const resolved = resolveInternal(join(REPO_ROOT, file), specifier);
  const hit = rule.forbiddenPaths.find((path) =>
    hasForbiddenPath(resolved, path),
  );
  return hit ? `forbidden internal path ${hit}` : null;
}

function collectViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const absFile of listSourceFiles(SRC_ROOT)) {
    const file = toRepoPath(absFile);
    const rule = LAYER_RULES.find((candidate) => candidate.matches(file));
    if (!rule) continue;
    const source = readFileSync(absFile, "utf8");
    for (const specifier of extractSpecifiers(source)) {
      const reason = checkImport(file, specifier, rule);
      if (reason)
        violations.push({ file, specifier, layer: rule.name, reason });
    }
  }
  return violations;
}

describe("layer rules (AGENTS section 3)", () => {
  it("scans at least one file per layer", () => {
    const files = listSourceFiles(SRC_ROOT).map(toRepoPath);
    for (const rule of LAYER_RULES) {
      expect(
        files.some((file) => rule.matches(file)),
        rule.name,
      ).toBe(true);
    }
  });

  it("has zero layer violations", () => {
    expect(collectViolations()).toEqual([]);
  });

  it("detects a forbidden import (scanner self-check)", () => {
    const rule = LAYER_RULES.find(
      (candidate) => candidate.name === "L2 domain",
    );
    expect(rule).toBeDefined();
    if (!rule) return;
    expect(checkImport("src/game/sim/Fake.ts", "pixi.js", rule)).not.toBeNull();
    expect(
      checkImport("src/game/sim/Fake.ts", "../../components/x/Y", rule),
    ).not.toBeNull();
    expect(checkImport("src/game/sim/Fake.ts", "./Rng", rule)).toBeNull();
  });
});
