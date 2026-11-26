import { gameConfig } from "../../config/gameConfig";
import type { GameMode } from "../../types/game";
import type { BotState } from "./BotProfiles";
import type { BotEnemyView, BotPerception } from "./botPerceptionTypes";

export interface Point {
  readonly x: number;
  readonly y: number;
}

const RECOVER_HP_FRACTION = 0.3;
const ATTACK_MIN_HP_FRACTION = 0.15;
const EVADE_HP_FRACTION = 0.4;
const RECOVER_BASE_DISTANCE_PX = 200;
const FLEE_DISTANCE_PX = 300;
const ARENA_MARGIN_PX = 200;

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function nearestTo<T extends Point>(
  from: Point,
  items: readonly T[],
): T | undefined {
  let best: T | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const d = distance(from, item);
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

export function clampToArena(
  point: Point,
  gameMode: GameMode,
  margin = gameConfig.wallThickness + ARENA_MARGIN_PX,
): Point {
  const width =
    gameMode === "crashfest"
      ? gameConfig.crashfestArenaWidth
      : gameConfig.arenaWidth;
  const height =
    gameMode === "crashfest"
      ? gameConfig.crashfestArenaHeight
      : gameConfig.arenaHeight;
  return {
    x: Math.min(width - margin, Math.max(margin, point.x)),
    y: Math.min(height - margin, Math.max(margin, point.y)),
  };
}

// Flee targets past a wall would pin the bot against it, so they are kept inside the arena.
export function pointAwayFrom(
  self: Point,
  threat: Point,
  gameMode: GameMode,
): Point {
  const dx = self.x - threat.x;
  const dy = self.y - threat.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    return clampToArena({ x: self.x + FLEE_DISTANCE_PX, y: self.y }, gameMode);
  }
  return clampToArena(
    {
      x: self.x + (dx / length) * FLEE_DISTANCE_PX,
      y: self.y + (dy / length) * FLEE_DISTANCE_PX,
    },
    gameMode,
  );
}

function enemiesAlive(view: BotPerception): readonly BotEnemyView[] {
  return view.enemies.filter((enemy) => enemy.hp > 0);
}

export function preferredAttackTarget(
  view: BotPerception,
): BotEnemyView | undefined {
  const width =
    view.gameMode === "crashfest"
      ? gameConfig.crashfestArenaWidth
      : gameConfig.arenaWidth;
  const height =
    view.gameMode === "crashfest"
      ? gameConfig.crashfestArenaHeight
      : gameConfig.arenaHeight;
  let best: BotEnemyView | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const enemy of enemiesAlive(view)) {
    const enemyDistance = distance(view.self, enemy);
    const hpFactor = 0.65 + 0.35 * (enemy.hp / gameConfig.maxHealth);
    const wallDistance = Math.min(
      enemy.x - gameConfig.wallThickness,
      width - gameConfig.wallThickness - enemy.x,
      enemy.y - gameConfig.wallThickness,
      height - gameConfig.wallThickness - enemy.y,
    );
    const wallFactor =
      wallDistance <= gameConfig.botWallPressureDistancePx
        ? gameConfig.botWallPressureTargetMultiplier
        : 1;
    const score = enemyDistance * hpFactor * wallFactor;
    if (score < bestScore) {
      best = enemy;
      bestScore = score;
    }
  }
  return best;
}

export function selectState(view: BotPerception): BotState {
  const { self } = view;
  const maxHp = gameConfig.maxHealth;
  const nearest = nearestTo(self, enemiesAlive(view));
  if (view.gameMode === "crashfest") {
    return nearest === undefined ? "SeekBill" : "Attack";
  }
  const nearestDistance =
    nearest === undefined ? Number.POSITIVE_INFINITY : distance(self, nearest);
  if (self.hp < maxHp * RECOVER_HP_FRACTION) {
    return "Recover";
  }
  if (self.cargo > 0) {
    return "DeliverCash";
  }
  if (
    self.hp < maxHp * EVADE_HP_FRACTION &&
    nearestDistance < gameConfig.botEvadeRadiusPx
  ) {
    return "Evade";
  }
  if (
    self.hp >= maxHp * ATTACK_MIN_HP_FRACTION &&
    nearestDistance < gameConfig.botAttackRadiusPx
  ) {
    return "Attack";
  }
  return "SeekBill";
}

export function targetFor(state: BotState, view: BotPerception): Point {
  const { self } = view;
  const base = { x: self.baseX, y: self.baseY };
  const nearestEnemy = nearestTo(self, enemiesAlive(view));
  switch (state) {
    case "Recover":
      if (
        nearestEnemy === undefined ||
        distance(self, base) > RECOVER_BASE_DISTANCE_PX
      ) {
        return base;
      }
      return pointAwayFrom(self, nearestEnemy, view.gameMode);
    case "DeliverCash":
      return base;
    case "Attack":
      return nearestEnemy ?? base;
    case "Evade":
      return nearestEnemy === undefined
        ? base
        : pointAwayFrom(self, nearestEnemy, view.gameMode);
    case "SeekBill":
      return nearestTo(self, view.bills) ?? view.fallback;
  }
}
