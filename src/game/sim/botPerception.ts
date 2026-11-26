import type { BaseView, BillSnapshot, GameMode } from "../../types/game";
import type { BotEnemyView, BotPerception } from "../bots/BotController";
import type { CarBodyState } from "../Physics";
import type { CarState } from "./CarState";

export interface PerceptionFrame {
  readonly gameMode: GameMode;
  readonly tick: number;
  readonly fallback: { readonly x: number; readonly y: number };
  readonly bodies: ReadonlyMap<number, CarBodyState>;
  readonly bills: readonly BillSnapshot[];
}

export interface PerceptionSource {
  readonly gameMode: GameMode;
  readonly tick: number;
  readonly arenaWidth: number;
  readonly arenaHeight: number;
  readonly pids: readonly number[];
  readonly cars: ReadonlyMap<number, CarState>;
  readonly basesByPid: ReadonlyMap<number, BaseView>;
}

export function buildPerceptionFrame(
  source: PerceptionSource,
  bodies: readonly CarBodyState[],
  bills: readonly BillSnapshot[],
): PerceptionFrame {
  const bodyIndex = new Map<number, CarBodyState>();
  for (const body of bodies) bodyIndex.set(body.pid, body);
  return {
    gameMode: source.gameMode,
    tick: source.tick,
    fallback: { x: source.arenaWidth / 2, y: source.arenaHeight / 2 },
    bodies: bodyIndex,
    bills,
  };
}

export function perceptionFor(
  source: PerceptionSource,
  frame: PerceptionFrame,
  pid: number,
): BotPerception {
  const body = requireBody(frame, pid);
  const car = requireCar(source, pid);
  const base = source.basesByPid.get(pid);
  return {
    self: {
      pid,
      x: body.x,
      y: body.y,
      angle: body.angle,
      speed: body.speed,
      hp: car.hp,
      cargo: car.carried.length,
      baseX: base?.x ?? body.x,
      baseY: base?.y ?? body.y,
    },
    gameMode: frame.gameMode,
    bills: frame.bills,
    enemies: enemiesFor(source, frame, pid),
    tick: frame.tick,
    fallback: frame.fallback,
  };
}

function enemiesFor(
  source: PerceptionSource,
  frame: PerceptionFrame,
  pid: number,
): BotEnemyView[] {
  const enemies: BotEnemyView[] = [];
  for (const other of source.pids) {
    if (other === pid || requireCar(source, other).destroyed) continue;
    const body = requireBody(frame, other);
    enemies.push({
      pid: other,
      x: body.x,
      y: body.y,
      vx: body.vx,
      vy: body.vy,
      hp: requireCar(source, other).hp,
    });
  }
  return enemies;
}

function requireBody(frame: PerceptionFrame, pid: number): CarBodyState {
  const body = frame.bodies.get(pid);
  if (body === undefined) {
    throw new Error(`MatchSimulation: missing physics body ${pid}`);
  }
  return body;
}

function requireCar(source: PerceptionSource, pid: number): CarState {
  const car = source.cars.get(pid);
  if (car === undefined) {
    throw new Error(`MatchSimulation: unknown car ${pid}`);
  }
  return car;
}
