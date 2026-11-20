import { createRng } from "../sim/Rng";

interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface CarDamageMark {
  readonly kind: "scratch" | "crack" | "grime";
  // One point for grime (width is the dot radius), two or more for scratch and crack polylines (width is the stroke width).
  readonly points: readonly Vec2[];
  readonly width: number;
  readonly threshold: number;
}

// Marks keep their full extent inside the body rectangle, inset by this padding (must exceed the largest width or radius).
const CAR_DAMAGE_MARK_PAD = 3;

const SCRATCH_SHARE = 0.6;
const CRACK_SHARE = 0.85;
const SCRATCH_LENGTH_MIN = 6;
const SCRATCH_LENGTH_RANGE = 10;
const CRACK_SEGMENTS = 4;
const CRACK_STEP_MIN = 3;
const CRACK_STEP_RANGE = 2;
const SCRATCH_WIDTH_MIN = 0.8;
const SCRATCH_WIDTH_RANGE = 0.4;
const CRACK_WIDTH = 0.7;
const GRIME_RADIUS_MIN = 1.5;
const GRIME_RADIUS_RANGE = 1;

export function markAlpha(
  damage: number,
  threshold: number,
  ramp: number,
): number {
  const d = clamp01(damage);
  if (ramp <= 0) return d >= threshold ? 1 : 0;
  return clamp01((d - threshold) / ramp);
}

export function generateCarDamageMarks(
  seed: number,
  count: number,
  halfWidth: number,
  halfHeight: number,
): CarDamageMark[] {
  const rng = createRng(seed);
  const limitX = halfWidth - CAR_DAMAGE_MARK_PAD;
  const limitY = halfHeight - CAR_DAMAGE_MARK_PAD;
  const clampPoint = (p: Vec2): Vec2 => ({
    x: clampRange(p.x, -limitX, limitX),
    y: clampRange(p.y, -limitY, limitY),
  });
  const marks: CarDamageMark[] = [];
  for (let i = 0; i < count; i += 1) {
    const roll = rng.next();
    const threshold = rng.next();
    const centre = {
      x: lerp(-limitX, limitX, rng.next()),
      y: lerp(-limitY, limitY, rng.next()),
    };
    if (roll < SCRATCH_SHARE) {
      const angle = rng.next() * Math.PI;
      const half = (SCRATCH_LENGTH_MIN + rng.next() * SCRATCH_LENGTH_RANGE) / 2;
      const dx = Math.cos(angle) * half;
      const dy = Math.sin(angle) * half;
      marks.push({
        kind: "scratch",
        points: [
          clampPoint({ x: centre.x - dx, y: centre.y - dy }),
          clampPoint({ x: centre.x + dx, y: centre.y + dy }),
        ],
        width: SCRATCH_WIDTH_MIN + rng.next() * SCRATCH_WIDTH_RANGE,
        threshold,
      });
    } else if (roll < CRACK_SHARE) {
      const points: Vec2[] = [clampPoint(centre)];
      let heading = rng.next() * Math.PI * 2;
      let cursor = centre;
      for (let s = 1; s < CRACK_SEGMENTS; s += 1) {
        heading += (rng.next() - 0.5) * Math.PI * 0.8;
        const step = CRACK_STEP_MIN + rng.next() * CRACK_STEP_RANGE;
        cursor = clampPoint({
          x: cursor.x + Math.cos(heading) * step,
          y: cursor.y + Math.sin(heading) * step,
        });
        points.push(cursor);
      }
      marks.push({ kind: "crack", points, width: CRACK_WIDTH, threshold });
    } else {
      marks.push({
        kind: "grime",
        points: [clampPoint(centre)],
        width: GRIME_RADIUS_MIN + rng.next() * GRIME_RADIUS_RANGE,
        threshold,
      });
    }
  }
  return marks;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clampRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
