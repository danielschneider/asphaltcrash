import { gameConfig } from "../../config/gameConfig";
import { spawnFor } from "../../config/spawnPoints";
import type {
  ArenaView,
  BaseView,
  BillSnapshot,
  MatchSetup,
} from "../../types/game";
import { buildArenaView } from "../arena";
import { BotController } from "../bots/BotController";
import type { InputFrame } from "../input/InputFrame";
import { PhysicsWorld, type CarBodyState } from "../Physics";
import { BillSpawner, type BaseRect } from "./BillSpawner";
import { createCarState, type CarState } from "./CarState";
import { MAX_PID } from "./matchConstants";
import { createRng } from "./Rng";

export interface SimState {
  readonly setup: MatchSetup;
  readonly arena: ArenaView;
  readonly physics: PhysicsWorld;
  readonly spawner: BillSpawner;
  readonly pids: readonly number[];
  readonly humanIds: ReadonlySet<number>;
  readonly basesByPid: ReadonlyMap<number, BaseView>;
  readonly cars: Map<number, CarState>;
  readonly bots: Map<number, BotController>;
  // Insertion order equals ascending id order: ids come from allocBillId and are registered immediately.
  readonly bills: Map<number, BillSnapshot>;
  readonly scores: Map<number, number>;
  readonly inputs: Map<number, InputFrame>;
  readonly contactTicks: Map<string, number>;
  currentTick: number;
  nextBillId: number;
  lastSpawnTick: number;
}

function validateSetup(setup: MatchSetup): void {
  const seen = new Set<number>();
  for (const pid of [...setup.humanPlayerIds, ...setup.botPlayerIds]) {
    if (!Number.isInteger(pid) || pid < 0 || pid > MAX_PID || seen.has(pid)) {
      throw new Error(`MatchSimulation: invalid or duplicate player id ${pid}`);
    }
    seen.add(pid);
  }
  if (
    setup.gameMode === "crashfest" &&
    setup.humanPlayerIds.length + setup.botPlayerIds.length < 2
  ) {
    throw new Error("MatchSimulation: crashfest requires at least two cars");
  }
}

function toSpawnRect(base: BaseView): BaseRect {
  return {
    x: base.x - base.width / 2,
    y: base.y - base.height / 2,
    width: base.width,
    height: base.height,
  };
}

function indexBasesByPid(bases: readonly BaseView[]): Map<number, BaseView> {
  const index = new Map<number, BaseView>();
  for (const base of bases) {
    if (!index.has(base.pid)) index.set(base.pid, base);
  }
  return index;
}

export function createSimState(setup: MatchSetup): SimState {
  validateSetup(setup);
  const arena = buildArenaView(
    setup.humanPlayerIds,
    setup.botPlayerIds,
    setup.gameMode,
  );
  const pids = [...setup.humanPlayerIds, ...setup.botPlayerIds].sort(
    (a, b) => a - b,
  );
  const physics = new PhysicsWorld(arena, arena.bases);
  const spawner = new BillSpawner(
    createRng(setup.seed),
    arena,
    arena.bases.map(toSpawnRect),
  );
  const cars = new Map<number, CarState>();
  const scores = new Map<number, number>();
  for (const pid of pids) {
    const spawn = spawnFor(pid, setup.gameMode);
    cars.set(pid, createCarState(pid, gameConfig.maxHealth));
    scores.set(pid, 0);
    physics.addCar(pid, spawn.x, spawn.y, spawn.angle);
  }
  const bots = new Map<number, BotController>();
  for (const pid of setup.botPlayerIds) {
    const rng = createRng(setup.seed + (pid + 1) * gameConfig.botSeedStride);
    bots.set(pid, new BotController(pid, setup.botDifficulty, rng));
  }
  return {
    setup,
    arena,
    physics,
    spawner,
    pids,
    humanIds: new Set(setup.humanPlayerIds),
    basesByPid: indexBasesByPid(arena.bases),
    cars,
    bots,
    bills: new Map(),
    scores,
    inputs: new Map(),
    contactTicks: new Map(),
    currentTick: 0,
    nextBillId: 1,
    lastSpawnTick: 0,
  };
}

export function carOf(state: SimState, pid: number): CarState {
  const car = state.cars.get(pid);
  if (car === undefined) {
    throw new Error(`MatchSimulation: unknown car ${pid}`);
  }
  return car;
}

export function bodyOf(state: SimState, pid: number): CarBodyState {
  const body = state.physics.getCar(pid);
  if (body === null) {
    throw new Error(`MatchSimulation: missing physics body ${pid}`);
  }
  return body;
}

export function allocBillId(state: SimState): number {
  const id = state.nextBillId;
  state.nextBillId += 1;
  return id;
}
