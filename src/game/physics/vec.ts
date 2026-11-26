export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const ZERO: Vec2 = { x: 0, y: 0 };

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function negate(v: Vec2): Vec2 {
  return { x: -v.x, y: -v.y };
}

export function headingOf(angle: number): Vec2 {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

// Wall normals point from the wall into the car. Velocity pointing into a wall is reflected with
// restitution; tangential components are kept so the car slides along the wall.
export function reflectOffWalls(
  velocity: Vec2,
  normals: readonly Vec2[],
  restitution: number,
): Vec2 {
  let v = velocity;
  for (const n of normals) {
    const vn = dot(v, n);
    if (vn >= 0) continue;
    const k = (1 + restitution) * vn;
    v = { x: v.x - k * n.x, y: v.y - k * n.y };
  }
  return v;
}

// Drops force components pushing into a wall so throttle slides the car along it instead of pinning it.
export function removeIntoWalls(force: Vec2, normals: readonly Vec2[]): Vec2 {
  let f = force;
  for (const n of normals) {
    const fn = dot(f, n);
    if (fn >= 0) continue;
    f = { x: f.x - fn * n.x, y: f.y - fn * n.y };
  }
  return f;
}
