import { createRng } from "../sim/Rng";

export interface GroundArena {
  readonly width: number;
  readonly height: number;
  readonly wallThickness: number;
}

export interface GroundLayoutConfig {
  readonly groundSpeckleCount: number;
  readonly groundPatchCount: number;
  readonly groundLaneDashLength: number;
  readonly groundLaneDashGap: number;
  readonly groundCurbWidth: number;
}

export interface GroundPoint {
  readonly x: number;
  readonly y: number;
  readonly tone: "light" | "dark";
}

export interface GroundRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly tone: "light" | "dark";
}

export interface GroundDash {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface GroundLayout {
  readonly speckles: readonly GroundPoint[];
  readonly patches: readonly GroundRect[];
  readonly laneDashes: readonly GroundDash[];
  readonly curbs: readonly GroundRect[];
}

const PATCH_MIN_SIZE = 160;
const PATCH_MAX_SIZE = 420;
const SPECKLE_DARK_CHANCE = 0.5;
const PATCH_LIGHT_CHANCE = 0.5;

export function generateGroundLayout(
  arena: GroundArena,
  seed: number,
  config: GroundLayoutConfig,
): GroundLayout {
  const rng = createRng(seed);
  const inner = {
    left: arena.wallThickness,
    top: arena.wallThickness,
    right: arena.width - arena.wallThickness,
    bottom: arena.height - arena.wallThickness,
  };
  const innerWidth = inner.right - inner.left;
  const innerHeight = inner.bottom - inner.top;

  const speckles: GroundPoint[] = [];
  for (let i = 0; i < config.groundSpeckleCount; i += 1) {
    speckles.push({
      x: inner.left + rng.next() * innerWidth,
      y: inner.top + rng.next() * innerHeight,
      tone: rng.next() < SPECKLE_DARK_CHANCE ? "dark" : "light",
    });
  }

  const patches: GroundRect[] = [];
  for (let i = 0; i < config.groundPatchCount; i += 1) {
    const width =
      PATCH_MIN_SIZE + rng.next() * (PATCH_MAX_SIZE - PATCH_MIN_SIZE);
    const height =
      PATCH_MIN_SIZE + rng.next() * (PATCH_MAX_SIZE - PATCH_MIN_SIZE);
    const x = inner.left + rng.next() * Math.max(0, innerWidth - width);
    const y = inner.top + rng.next() * Math.max(0, innerHeight - height);
    patches.push({
      x,
      y,
      width,
      height,
      tone: rng.next() < PATCH_LIGHT_CHANCE ? "light" : "dark",
    });
  }

  const centreY = arena.height / 2;
  const centreX = arena.width / 2;
  const laneDashes = [
    ...dashedLine(
      inner.left,
      inner.right,
      (from, to) => ({ x1: from, y1: centreY, x2: to, y2: centreY }),
      config,
    ),
    ...dashedLine(
      inner.top,
      inner.bottom,
      (from, to) => ({ x1: centreX, y1: from, x2: centreX, y2: to }),
      config,
    ),
  ];

  const curbWidth = config.groundCurbWidth;
  const curbs: GroundRect[] = [
    {
      x: inner.left,
      y: inner.top,
      width: innerWidth,
      height: curbWidth,
      tone: "dark",
    },
    {
      x: inner.left,
      y: inner.bottom - curbWidth,
      width: innerWidth,
      height: curbWidth,
      tone: "dark",
    },
    {
      x: inner.left,
      y: inner.top,
      width: curbWidth,
      height: innerHeight,
      tone: "dark",
    },
    {
      x: inner.right - curbWidth,
      y: inner.top,
      width: curbWidth,
      height: innerHeight,
      tone: "dark",
    },
  ];

  return { speckles, patches, laneDashes, curbs };
}

function dashedLine(
  from: number,
  to: number,
  toDash: (start: number, end: number) => GroundDash,
  config: GroundLayoutConfig,
): GroundDash[] {
  const dashes: GroundDash[] = [];
  const period = config.groundLaneDashLength + config.groundLaneDashGap;
  if (period <= 0 || config.groundLaneDashLength <= 0) return dashes;
  for (let start = from; start < to; start += period) {
    const end = Math.min(start + config.groundLaneDashLength, to);
    dashes.push(toDash(start, end));
  }
  return dashes;
}
