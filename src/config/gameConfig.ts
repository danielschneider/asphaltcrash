import type { BotDifficulty } from "../types/game";

export interface SpawnPoint {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface BotProfileParams {
  readonly reactionDelayTicks: number;
  readonly aimNoiseRad: number;
  readonly aggression: number;
}

export interface BotProfilesShape {
  readonly easy: BotProfileParams;
  readonly normal: BotProfileParams;
  readonly hard: BotProfileParams;
}

export interface GameConfigShape {
  readonly matchSeconds: number;
  readonly timerWarningSeconds: readonly number[];
  readonly maxHumans: number;
  readonly maxCars: number;
  readonly startCountdownSeconds: number;
  readonly respawnSeconds: number;
  readonly invulnerableAfterRespawnSeconds: number;
  readonly maxHealth: number;
  readonly maxDamagePerHit: number;
  readonly rammerDamageShare: number;
  readonly damageThresholdImpulse: number;
  readonly damageFactor: number;
  readonly wallSideDamageMultiplier: number;
  readonly humanDamageTakenMultiplier: Readonly<Record<BotDifficulty, number>>;
  readonly contactCooldownMs: number;
  readonly attributionWindowSeconds: number;
  readonly cargoCapacity: number;
  readonly maxBillsOnField: number;
  readonly billSpawnIntervalSeconds: number;
  readonly killBonus: number;
  readonly boostSeconds: number;
  readonly boostCooldownSeconds: number;
  readonly snapshotHz: number;
  readonly inputHz: number;
  readonly interpDelayMs: number;
  readonly reconnectWindowMs: number;
  readonly inputTimeoutMs: number;
  readonly hostSilenceTimeoutMs: number;
  readonly lobbyConnectTimeoutMs: number;
  readonly matchReadyTimeoutMs: number;
  readonly fixedStepHz: number;
  readonly visualSeed: number;
  readonly maxFrameDeltaMs: number;
  readonly hudHz: number;
  readonly hitEventThreshold: number;
  readonly cameraShakePx: number;
  readonly cameraShakeMs: number;
  readonly cameraZoomRest: number;
  readonly cameraZoomMoving: number;
  readonly cameraFollowLerp: number;
  readonly cameraZoomOutLerp: number;
  readonly arenaWidth: number;
  readonly arenaHeight: number;
  readonly crashfestArenaWidth: number;
  readonly crashfestArenaHeight: number;
  readonly wallThickness: number;
  readonly carWidth: number;
  readonly carHeight: number;
  readonly carNameMaxChars: number;
  readonly carNameFontSize: number;
  readonly carNameGap: number;
  readonly carMass: number;
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly billMinDistanceFromBase: number;
  readonly billPlacementAttempts: number;
  readonly billRadius: number;
  readonly billValues: readonly number[];
  readonly billWeightsPct: readonly number[];
  readonly humanSpawns: readonly SpawnPoint[];
  readonly botSpawns: readonly SpawnPoint[];
  readonly maxForwardSpeed: number;
  readonly maxReverseSpeed: number;
  readonly acceleration: number;
  readonly braking: number;
  readonly lateralGrip: number;
  readonly airFriction: number;
  readonly carFriction: number;
  readonly carRestitution: number;
  readonly wallFriction: number;
  readonly wallRestitution: number;
  readonly boostSpeedBonus: number;
  readonly steerRateRadPerSec: number;
  readonly steerSpeedPenalty: number;
  readonly steerFullEngagementSpeedFraction: number;
  readonly aimTurnFullAngleRad: number;
  readonly aimDriveAngleRad: number;
  readonly aimBrakeSpeedPxs: number;
  readonly aimPivotRateRadPerSec: number;
  readonly joystickRadiusPx: number;
  readonly joystickDeadZone: number;
  readonly botDefaultCount: number;
  readonly botSeedStride: number;
  readonly botAttackRadiusPx: number;
  readonly botEvadeRadiusPx: number;
  readonly botProfiles: BotProfilesShape;
  readonly playerColors: readonly number[];
  readonly carDamageShaderEnabled: boolean;
  readonly carDamageMaxStrength: number;
  readonly carDamageSmoothingRate: number;
  readonly carDamageScratchCount: number;
  readonly carDamageMarkRamp: number;
  readonly groundSpeckleCount: number;
  readonly groundPatchCount: number;
  readonly groundCurbWidth: number;
  readonly audioEnabled: boolean;
  readonly audioMasterVolume: number;
  readonly audioOwnCarGain: number;
  readonly audioOtherCarGain: number;
  readonly audioHearingRadiusPx: number;
  readonly audioEngineIdleHz: number;
  readonly audioEngineMaxHz: number;
  readonly audioEngineIdleGain: number;
  readonly audioEngineMaxGain: number;
  readonly audioThrottleAttackSeconds: number;
  readonly audioThrottleReleaseSeconds: number;
  readonly audioAccelThreshold: number;
  readonly audioAccelMaxGain: number;
  readonly audioSqueakTurnRate: number;
  readonly audioSqueakMaxGain: number;
  readonly audioSqueakMinSpeedFraction: number;
  readonly audioSqueakFullTurnRate: number;
}

const ARENA_WIDTH = 3200;
const ARENA_HEIGHT = 2400;
const ARENA_CENTRE_X = ARENA_WIDTH / 2;
const ARENA_CENTRE_Y = ARENA_HEIGHT / 2;

// Screen coordinates: +y is down. Spawn angles point each car toward the arena centre.
function facingCentre(x: number, y: number): number {
  return Math.atan2(ARENA_CENTRE_Y - y, ARENA_CENTRE_X - x);
}

// Spawn layout: humans in the four corners; bots on the top/bottom edges, the left/right edges and two inner columns.
// Positions are mirror-symmetric on both axes. Bases (160x120) are centred on spawns and do not overlap each other or walls.
export const gameConfig = {
  matchSeconds: 180,
  timerWarningSeconds: [30, 10, 0],
  maxHumans: 4,
  maxCars: 16,
  startCountdownSeconds: 3,
  respawnSeconds: 3,
  invulnerableAfterRespawnSeconds: 2,
  maxHealth: 100,
  maxDamagePerHit: 40,
  // Fraction of the computed damage the rammer (attacker) takes in a car-car hit. Victim takes full damage.
  rammerDamageShare: 0.25,
  damageThresholdImpulse: 0.8,
  damageFactor: 9,
  wallSideDamageMultiplier: 0.1,
  // Scales damage taken by human-controlled cars. Bots are never scaled.
  humanDamageTakenMultiplier: {
    easy: 0.4,
    normal: 0.6,
    hard: 1,
  },
  contactCooldownMs: 300,
  attributionWindowSeconds: 1,
  cargoCapacity: 5,
  maxBillsOnField: 12,
  billSpawnIntervalSeconds: 2.5,
  killBonus: 50,
  boostSeconds: 0.6,
  boostCooldownSeconds: 2,
  snapshotHz: 20,
  inputHz: 30,
  interpDelayMs: 100,
  reconnectWindowMs: 45000,
  inputTimeoutMs: 500,
  hostSilenceTimeoutMs: 15000,
  lobbyConnectTimeoutMs: 10000,
  matchReadyTimeoutMs: 5000,
  fixedStepHz: 60,
  visualSeed: 1337,
  maxFrameDeltaMs: 250,
  hudHz: 10,
  hitEventThreshold: 0.5,
  cameraShakePx: 4,
  cameraShakeMs: 150,
  // Zoom factor (larger = closer). Geometric blend by speedFraction: rest at 0, moving at 1 (GAMEPLAY 7.1).
  cameraZoomRest: 1.5,
  cameraZoomMoving: 0.55,
  cameraFollowLerp: 6,
  cameraZoomOutLerp: 10,
  arenaWidth: ARENA_WIDTH,
  arenaHeight: ARENA_HEIGHT,
  crashfestArenaWidth: 1600,
  crashfestArenaHeight: 1200,
  wallThickness: 40,
  carWidth: 48,
  carHeight: 24,
  carNameMaxChars: 20,
  carNameFontSize: 12,
  carNameGap: 6,
  // Matter.js body mass. Matches the default density (0.001) times car area (48 * 24 = 1152), rounded.
  carMass: 1.2,
  baseWidth: 160,
  baseHeight: 120,
  billMinDistanceFromBase: 120,
  billPlacementAttempts: 20,
  billRadius: 12,
  billValues: [10, 20, 50],
  billWeightsPct: [70, 20, 10],
  humanSpawns: [
    { x: 300, y: 300, angle: facingCentre(300, 300) },
    { x: 2900, y: 300, angle: facingCentre(2900, 300) },
    { x: 300, y: 2100, angle: facingCentre(300, 2100) },
    { x: 2900, y: 2100, angle: facingCentre(2900, 2100) },
  ],
  botSpawns: [
    { x: 1000, y: 250, angle: facingCentre(1000, 250) },
    { x: 250, y: 800, angle: facingCentre(250, 800) },
    { x: 900, y: 800, angle: facingCentre(900, 800) },
    { x: 2200, y: 250, angle: facingCentre(2200, 250) },
    { x: 2950, y: 800, angle: facingCentre(2950, 800) },
    { x: 2300, y: 800, angle: facingCentre(2300, 800) },
    { x: 1000, y: 2150, angle: facingCentre(1000, 2150) },
    { x: 250, y: 1600, angle: facingCentre(250, 1600) },
    { x: 900, y: 1600, angle: facingCentre(900, 1600) },
    { x: 2200, y: 2150, angle: facingCentre(2200, 2150) },
    { x: 2950, y: 1600, angle: facingCentre(2950, 1600) },
    { x: 2300, y: 1600, angle: facingCentre(2300, 1600) },
  ],
  maxForwardSpeed: 360,
  maxReverseSpeed: 120,
  acceleration: 650,
  braking: 100,
  lateralGrip: 0.25,
  // Matter applies airFriction on every fixed step; a low value retains momentum through turns.
  airFriction: 0.0025,
  carFriction: 0.05,
  carRestitution: 0.35,
  wallFriction: 0.1,
  wallRestitution: 0.45,
  boostSpeedBonus: 200,
  // Steering ramps in with speed to avoid turning in place, then tapers at top speed (GAMEPLAY 4.1).
  steerRateRadPerSec: 3.4,
  steerSpeedPenalty: 0.4,
  steerFullEngagementSpeedFraction: 0.25,
  // Aim-based driving: the car turns toward the stick direction and drives once within aimDriveAngleRad.
  aimTurnFullAngleRad: 0.6,
  aimDriveAngleRad: 0.5,
  aimBrakeSpeedPxs: 20,
  aimPivotRateRadPerSec: 2.6,
  joystickRadiusPx: 72,
  joystickDeadZone: 0.12,
  botDefaultCount: 8,
  botSeedStride: 7919,
  botAttackRadiusPx: 500,
  botEvadeRadiusPx: 200,
  botProfiles: {
    easy: {
      reactionDelayTicks: 18,
      aimNoiseRad: 0.35,
      aggression: 0.2,
    },
    normal: {
      reactionDelayTicks: 6,
      aimNoiseRad: 0.12,
      aggression: 0.7,
    },
    hard: {
      reactionDelayTicks: 3,
      aimNoiseRad: 0.04,
      aggression: 0.9,
    },
  },
  playerColors: [
    0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d, 0x9b5de5, 0xf15bb5, 0x8ac926,
    0xffd166, 0x00b4d8, 0x6a4c93, 0xff7f11, 0x3a86ff, 0x06d6a0, 0xc1121f,
    0x7d8597, 0xfb8500,
  ],
  carDamageShaderEnabled: false,
  carDamageMaxStrength: 0.85,
  carDamageSmoothingRate: 4,
  carDamageScratchCount: 10,
  carDamageMarkRamp: 0.35,
  groundSpeckleCount: 900,
  groundPatchCount: 14,
  groundCurbWidth: 16,
  audioEnabled: true,
  audioMasterVolume: 0.6,
  audioOwnCarGain: 1,
  audioOtherCarGain: 0.35,
  audioHearingRadiusPx: 1400,
  audioEngineIdleHz: 38,
  audioEngineMaxHz: 120,
  audioEngineIdleGain: 0.18,
  audioEngineMaxGain: 0.6,
  // Throttle ramps up quickly but releases slowly so the engine winds down instead of cutting out.
  audioThrottleAttackSeconds: 0.08,
  audioThrottleReleaseSeconds: 0.7,
  audioAccelThreshold: 0.6,
  audioAccelMaxGain: 0.35,
  // Tyre squeal starts above this yaw rate (rad/s) and reaches full level at audioSqueakFullTurnRate.
  audioSqueakTurnRate: 1.6,
  audioSqueakMaxGain: 0.45,
  audioSqueakMinSpeedFraction: 0.35,
  audioSqueakFullTurnRate: 3,
} as const satisfies GameConfigShape;
