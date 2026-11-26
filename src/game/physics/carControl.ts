import Matter from "matter-js";
import { gameConfig } from "../../config/gameConfig";
import { MS_PER_SECOND } from "../sim/time";
import { aimDrive, slideAim, type AimDrive } from "../sim/aimDrive";
import { clamp, dot, headingOf, removeIntoWalls, type Vec2 } from "./vec";

const FIXED_STEP_HZ = gameConfig.fixedStepHz;
// Matter applies force as dv = F/m * deltaMs^2 with deltaMs in ms. Converting to px/s^2 gives F = m * a / MS_PER_SECOND^2.
const FORCE_PER_ACCEL = 1 / (MS_PER_SECOND * MS_PER_SECOND);
const LATERAL_RETENTION = Math.exp(-gameConfig.lateralGrip / FIXED_STEP_HZ);
// Reverse for this many steps once blocked so the car clears the wall instead of re-entering it each step.
const REVERSE_ESCAPE_STEPS = 20;

interface HeadingFrame {
  readonly heading: Vec2;
  readonly side: Vec2;
}

interface DriveDecision {
  readonly drive: AimDrive;
  readonly reverseSteps: number;
}

export function forwardCapFor(boostActive: boolean): number {
  return (
    gameConfig.maxForwardSpeed + (boostActive ? gameConfig.boostSpeedBonus : 0)
  );
}

export function headingFrame(angle: number): HeadingFrame {
  const heading = headingOf(angle);
  return { heading, side: { x: -heading.y, y: heading.x } };
}

export function lateralComponent(velocity: Vec2, side: Vec2): number {
  return dot(velocity, side) * LATERAL_RETENTION;
}

export function forwardPxsOf(velocity: Vec2, heading: Vec2): number {
  return dot(velocity, heading) * FIXED_STEP_HZ;
}

function throttleAccel(
  throttle: number,
  forwardPxs: number,
  forwardCap: number,
): number {
  if (throttle > 0) {
    return forwardPxs < forwardCap ? throttle * gameConfig.acceleration : 0;
  }
  if (throttle < 0 && forwardPxs > 0) {
    return throttle * gameConfig.braking;
  }
  if (throttle < 0) {
    return forwardPxs > -gameConfig.maxReverseSpeed
      ? throttle * gameConfig.acceleration
      : 0;
  }
  return 0;
}

export function decideDrive(
  aimX: number,
  aimY: number,
  angle: number,
  forwardPxs: number,
  normals: readonly Vec2[],
  reverseSteps: number,
): DriveDecision {
  const steering = aimDrive(aimX, aimY, angle, forwardPxs);
  const wallAim = slideAim(aimX, aimY, normals);
  const remaining = wallAim.isBlocked ? REVERSE_ESCAPE_STEPS : reverseSteps;
  if (remaining > 0) {
    return {
      drive: { steer: steering.steer, throttle: -1 },
      reverseSteps: remaining - 1,
    };
  }
  return {
    drive: aimDrive(wallAim.aimX, wallAim.aimY, angle, forwardPxs),
    reverseSteps: 0,
  };
}

export function applySteer(body: Matter.Body, steer: number): void {
  if (steer === 0) {
    Matter.Body.setAngularVelocity(body, 0);
    return;
  }
  const speedFraction = clamp(
    (Math.hypot(body.velocity.x, body.velocity.y) * FIXED_STEP_HZ) /
      gameConfig.maxForwardSpeed,
    0,
    1,
  );
  const steerEngagement = clamp(
    speedFraction / gameConfig.steerFullEngagementSpeedFraction,
    0,
    1,
  );
  const steerScale = 1 - gameConfig.steerSpeedPenalty * speedFraction;
  const rollingRate =
    gameConfig.steerRateRadPerSec * steerEngagement * steerScale;
  const pivotRate = gameConfig.aimPivotRateRadPerSec * (1 - steerEngagement);
  Matter.Body.setAngularVelocity(
    body,
    (steer * (rollingRate + pivotRate)) / FIXED_STEP_HZ,
  );
}

export function applyThrottle(
  body: Matter.Body,
  heading: Vec2,
  throttle: number,
  forwardPxs: number,
  forwardCap: number,
  normals: readonly Vec2[],
): void {
  const accel = throttleAccel(throttle, forwardPxs, forwardCap);
  if (accel === 0) return;
  const force = accel * gameConfig.carMass * FORCE_PER_ACCEL;
  Matter.Body.applyForce(
    body,
    body.position,
    removeIntoWalls({ x: heading.x * force, y: heading.y * force }, normals),
  );
}
