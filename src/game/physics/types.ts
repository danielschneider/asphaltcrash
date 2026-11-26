export interface PhysicsContact {
  readonly kind: "car-car" | "car-wall" | "car-bill" | "car-base";
  readonly aPid: number;
  readonly bPid: number | null;
  readonly billId: number | null;
  readonly impulse: number;
  readonly rammerPid: number | null;
  readonly frontImpact: number | null;
}

export interface CarBodyState {
  readonly pid: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
}

export interface CarControl {
  readonly aimX: number;
  readonly aimY: number;
  readonly boost: boolean;
}

export interface PhysicsArena {
  readonly width: number;
  readonly height: number;
  readonly wallThickness: number;
}

export interface PhysicsBase {
  readonly pid: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type BodyKind = "car" | "wall" | "bill" | "base";

export interface BodyMeta {
  readonly kind: BodyKind;
  readonly pid: number;
  readonly billId: number | null;
}
