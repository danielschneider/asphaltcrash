import { gameConfig } from "../../config/gameConfig";
import type { BillValue } from "../../types/game";
import type { Rng } from "./Rng";
import { secondsToTicks } from "./time";

export interface ArenaBounds {
  readonly width: number;
  readonly height: number;
  readonly wallThickness: number;
}

export interface BaseRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SpawnedBill {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly value: BillValue;
}

export class BillSpawner {
  private readonly rng: Rng;
  private readonly arena: ArenaBounds;
  private readonly bases: readonly BaseRect[];

  constructor(rng: Rng, arena: ArenaBounds, bases: readonly BaseRect[]) {
    this.rng = rng;
    this.arena = arena;
    this.bases = bases;
  }

  maybeSpawn(
    nowTick: number,
    fieldBillCount: number,
    lastSpawnTick: number,
    nextBillId: () => number,
  ): SpawnedBill | null {
    if (fieldBillCount >= gameConfig.maxBillsOnField) return null;
    if (
      nowTick - lastSpawnTick <
      secondsToTicks(gameConfig.billSpawnIntervalSeconds)
    ) {
      return null;
    }
    const position = this.findPosition();
    if (position === null) return null;
    return {
      id: nextBillId(),
      x: position.x,
      y: position.y,
      value: this.pickValue(),
    };
  }

  private pickValue(): BillValue {
    const { billValues, billWeightsPct } = gameConfig;
    const total = billWeightsPct.reduce((sum, weight) => sum + weight, 0);
    const roll = this.rng.next() * total;
    let cumulative = 0;
    for (let i = 0; i < billValues.length; i += 1) {
      cumulative += billWeightsPct[i] ?? 0;
      if (roll < cumulative) return billValues[i] as BillValue;
    }
    return billValues[billValues.length - 1] as BillValue;
  }

  private findPosition(): { x: number; y: number } | null {
    const margin = gameConfig.billRadius + this.arena.wallThickness;
    const minX = margin;
    const maxX = this.arena.width - margin;
    const minY = margin;
    const maxY = this.arena.height - margin;
    for (
      let attempt = 0;
      attempt < gameConfig.billPlacementAttempts;
      attempt += 1
    ) {
      const x = this.rng.nextInt(minX, maxX);
      const y = this.rng.nextInt(minY, maxY);
      if (this.isFarFromBases(x, y)) return { x, y };
    }
    return null;
  }

  private isFarFromBases(x: number, y: number): boolean {
    return this.bases.every(
      (base) =>
        distanceToRect(x, y, base) >= gameConfig.billMinDistanceFromBase,
    );
  }
}

function distanceToRect(x: number, y: number, rect: BaseRect): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}
