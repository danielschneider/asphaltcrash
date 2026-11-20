import { gameConfig } from "../../config/gameConfig";
import type { BotDifficulty } from "../../types/game";
import { clampInputFrame, type InputFrame } from "../input/InputFrame";
import type { Rng } from "../sim/Rng";
import { type BotProfile, type BotState, profileFor } from "./BotProfiles";

export interface BotSelfView {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly speed: number;
  readonly hp: number;
  readonly cargo: number;
  readonly pid: number;
  readonly baseX: number;
  readonly baseY: number;
}

export interface BotBillView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface BotEnemyView {
  readonly pid: number;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
}

export interface BotPerception {
  readonly self: BotSelfView;
  readonly bills: readonly BotBillView[];
  readonly enemies: readonly BotEnemyView[];
  readonly tick: number;
  readonly fallback: { readonly x: number; readonly y: number };
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Decision {
  readonly aimX: number;
  readonly aimY: number;
  readonly action: boolean;
  readonly state: BotState;
}

const RECOVER_HP_FRACTION = 0.3;
const ATTACK_MIN_HP_FRACTION = 0.3;
const EVADE_HP_FRACTION = 0.6;
const RECOVER_BASE_DISTANCE_PX = 200;
const FLEE_DISTANCE_PX = 300;
const BOOST_ANGLE_RAD = 0.2;
const BOOST_MIN_AGGRESSION = 0.5;
const IDLE_DECISION: Decision = {
  aimX: 0,
  aimY: 0,
  action: false,
  state: "SeekBill",
};

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalizeAngle(angle: number): number {
  const wrapped = angle % (2 * Math.PI);
  if (wrapped > Math.PI) {
    return wrapped - 2 * Math.PI;
  }
  if (wrapped <= -Math.PI) {
    return wrapped + 2 * Math.PI;
  }
  return wrapped;
}

function nearestTo<T extends Point>(
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

function pointAwayFrom(self: Point, threat: Point): Point {
  const dx = self.x - threat.x;
  const dy = self.y - threat.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    return { x: self.x + FLEE_DISTANCE_PX, y: self.y };
  }
  return {
    x: self.x + (dx / length) * FLEE_DISTANCE_PX,
    y: self.y + (dy / length) * FLEE_DISTANCE_PX,
  };
}

export class BotController {
  private readonly playerId: number;
  private readonly profile: BotProfile;
  private readonly rng: Rng;
  private callCount = 0;
  private seq = 0;
  private held: Decision = IDLE_DECISION;

  constructor(playerId: number, difficulty: BotDifficulty, rng: Rng) {
    this.playerId = playerId;
    this.profile = profileFor(difficulty);
    this.rng = rng;
  }

  get pid(): number {
    return this.playerId;
  }

  get state(): BotState {
    return this.held.state;
  }

  decide(view: BotPerception): InputFrame {
    const period = Math.max(1, this.profile.reactionDelayTicks);
    const shouldReplan = this.callCount % period === 0;
    this.callCount += 1;
    if (shouldReplan) {
      this.held = this.plan(view);
    }
    this.seq += 1;
    return clampInputFrame({
      aimX: this.held.aimX,
      aimY: this.held.aimY,
      action: this.held.action,
      seq: this.seq,
    });
  }

  private plan(view: BotPerception): Decision {
    const state = selectState(view);
    const target = targetFor(state, view);
    const bearing = Math.atan2(target.y - view.self.y, target.x - view.self.x);
    const noise = (this.rng.next() - 0.5) * 2 * this.profile.aimNoiseRad;
    const aimAngle = bearing + noise;
    const angleDiff = normalizeAngle(bearing - view.self.angle);
    const action =
      state === "Attack" &&
      this.profile.aggression > BOOST_MIN_AGGRESSION &&
      Math.abs(angleDiff) < BOOST_ANGLE_RAD;
    return {
      aimX: Math.cos(aimAngle),
      aimY: Math.sin(aimAngle),
      action,
      state,
    };
  }
}

function enemiesAlive(view: BotPerception): readonly BotEnemyView[] {
  return view.enemies.filter((enemy) => enemy.hp > 0);
}

function selectState(view: BotPerception): BotState {
  const { self } = view;
  const maxHp = gameConfig.maxHealth;
  const nearest = nearestTo(self, enemiesAlive(view));
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

function targetFor(state: BotState, view: BotPerception): Point {
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
      return pointAwayFrom(self, nearestEnemy);
    case "DeliverCash":
      return base;
    case "Attack":
      return nearestEnemy ?? base;
    case "Evade":
      return nearestEnemy === undefined
        ? base
        : pointAwayFrom(self, nearestEnemy);
    case "SeekBill":
      return nearestTo(self, view.bills) ?? view.fallback;
  }
}
