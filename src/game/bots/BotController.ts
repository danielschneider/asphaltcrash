import { gameConfig } from "../../config/gameConfig";
import type { BotDifficulty } from "../../types/game";
import { clampInputFrame, type InputFrame } from "../input/InputFrame";
import type { Rng } from "../sim/Rng";
import { type BotProfile, type BotState, profileFor } from "./BotProfiles";
import type { BotPerception } from "./botPerceptionTypes";
import {
  clampToArena,
  type Point,
  preferredAttackTarget,
  selectState,
  targetFor,
} from "./botTargeting";

export type {
  BotBillView,
  BotEnemyView,
  BotPerception,
  BotSelfView,
} from "./botPerceptionTypes";

interface Decision {
  readonly aimX: number;
  readonly aimY: number;
  readonly action: boolean;
  readonly state: BotState;
}

const BOOST_ANGLE_RAD = 0.2;
const BOOST_MIN_AGGRESSION = 0.5;
const IDLE_DECISION: Decision = {
  aimX: 0,
  aimY: 0,
  action: false,
  state: "SeekBill",
};

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

export class BotController {
  private readonly playerId: number;
  private readonly profile: BotProfile;
  private readonly rng: Rng;
  private callCount = 0;
  private seq = 0;
  private held: Decision = IDLE_DECISION;
  private attackTargetPid = -1;
  private attackSide: -1 | 1 = 1;

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
    const target =
      state === "Attack" ? this.attackTargetFor(view) : targetFor(state, view);
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

  private attackTargetFor(view: BotPerception): Point {
    const enemy = preferredAttackTarget(view);
    if (enemy === undefined) {
      return { x: view.self.x, y: view.self.y };
    }
    if (enemy.pid !== this.attackTargetPid) {
      this.attackTargetPid = enemy.pid;
      this.attackSide = this.rng.next() < 0.5 ? -1 : 1;
    }

    const dx = enemy.x - view.self.x;
    const dy = enemy.y - view.self.y;
    const distance = Math.hypot(dx, dy);
    const leadSeconds = Math.min(
      gameConfig.botAttackLeadSeconds,
      distance / gameConfig.maxForwardSpeed,
    );
    const flankDistance =
      gameConfig.botAttackFlankDistancePx * this.profile.flankFactor;
    const inverseDistance = distance > 0 ? 1 / distance : 0;
    return clampToArena(
      {
        x:
          enemy.x +
          enemy.vx * leadSeconds -
          dy * inverseDistance * flankDistance * this.attackSide,
        y:
          enemy.y +
          enemy.vy * leadSeconds +
          dx * inverseDistance * flankDistance * this.attackSide,
      },
      view.gameMode,
      gameConfig.wallThickness + gameConfig.carWidth,
    );
  }
}
