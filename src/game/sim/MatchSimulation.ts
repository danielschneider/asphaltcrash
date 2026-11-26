import type {
  ArenaView,
  CarSnapshot,
  GameMode,
  MatchSetup,
  MatchSnapshot,
  SimEvent,
  SimEvents,
} from "../../types/game";
import { NEUTRAL_INPUT, type InputFrame } from "../input/InputFrame";
import type { PhysicsContact } from "../Physics";
import { carFlags, recordHit } from "./CarState";
import { deliver, pickUp, spawnNewBill } from "./billFlow";
import { resolveDamage } from "./damageResolver";
import {
  buildPerceptionFrame,
  perceptionFor,
  type PerceptionSource,
} from "./botPerception";
import { BOOST_COOLDOWN_TICKS, BOOST_TICKS } from "./matchConstants";
import { resolveDestruction, resolveRespawns } from "./respawn";
import { bodyOf, carOf, createSimState, type SimState } from "./simState";
import { timerEventsCrossed, timerRemainingMs } from "./Scoring";
import { secondsToMs } from "./time";

export interface MatchTestHook {
  readonly placeCar: (pid: number, x: number, y: number, angle: number) => void;
  readonly setHealth: (
    pid: number,
    health: number,
    attackerPid?: number,
  ) => void;
}

const testHooks = new WeakMap<MatchSimulation, MatchTestHook>();

// Internal test hook used by src/game/sim/testing.ts. Not part of the public simulation API.
export function getMatchTestHook(
  sim: MatchSimulation,
): MatchTestHook | undefined {
  return testHooks.get(sim);
}

export class MatchSimulation {
  private readonly state: SimState;
  private finished = false;
  private winners: readonly number[] = [];

  constructor(setup: MatchSetup) {
    this.state = createSimState(setup);
    testHooks.set(this, {
      placeCar: (pid, x, y, angle) => this.placeCarInternal(pid, x, y, angle),
      setHealth: (pid, health, attackerPid) => {
        const car = carOf(this.state, pid);
        car.hp = health;
        if (attackerPid !== undefined) {
          recordHit(
            car,
            { attackerPid, tick: this.state.currentTick, impulse: 1 },
            this.state.currentTick,
          );
        }
      },
    });
  }

  get tick(): number {
    return this.state.currentTick;
  }

  get arena(): ArenaView {
    return this.state.arena;
  }

  get gameMode(): GameMode {
    return this.state.setup.gameMode;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get winnerPids(): readonly number[] {
    return this.winners;
  }

  setInput(playerId: number, input: InputFrame): void {
    if (!this.state.humanIds.has(playerId)) return;
    this.state.inputs.set(playerId, input);
  }

  inputFor(playerId: number): InputFrame {
    return this.state.inputs.get(playerId) ?? NEUTRAL_INPUT;
  }

  step(): SimEvents {
    if (this.finished) return [];
    const tick = this.state.currentTick;
    const events: SimEvent[] = [];
    this.decideBots();
    this.applyControls();
    const contacts = this.state.physics.step();
    resolveDamage(this.state, contacts, tick, events);
    resolveDestruction(this.state, tick, events);
    resolveRespawns(this.state, tick, events);
    this.resolveCarContacts(contacts, events);
    this.resolveCrashfestEnd();
    if (this.state.setup.gameMode === "cash") {
      spawnNewBill(this.state, tick, events);
      this.emitTimer(tick, events);
    }
    this.state.currentTick += 1;
    return events;
  }

  snapshot(): MatchSnapshot {
    const { state } = this;
    return {
      tick: state.currentTick,
      timeRemainingMs:
        state.setup.gameMode === "crashfest"
          ? 0
          : timerRemainingMs(state.currentTick, state.setup.matchSeconds),
      cars: state.pids.map((pid) => this.carSnapshot(pid)),
      bills: [...state.bills.values()].map((bill) => ({ ...bill })),
    };
  }

  private decideBots(): void {
    const { state } = this;
    if (state.bots.size === 0) return;
    const source = this.perceptionSource();
    const frame = buildPerceptionFrame(source, state.physics.carStates(), [
      ...state.bills.values(),
    ]);
    for (const [pid, bot] of state.bots) {
      if (carOf(state, pid).destroyed) {
        state.inputs.set(pid, NEUTRAL_INPUT);
        continue;
      }
      state.inputs.set(pid, bot.decide(perceptionFor(source, frame, pid)));
    }
  }

  private perceptionSource(): PerceptionSource {
    const { state } = this;
    return {
      gameMode: state.setup.gameMode,
      tick: state.currentTick,
      arenaWidth: state.arena.width,
      arenaHeight: state.arena.height,
      pids: state.pids,
      cars: state.cars,
      basesByPid: state.basesByPid,
    };
  }

  private applyControls(): void {
    const { state } = this;
    for (const pid of state.pids) {
      const car = carOf(state, pid);
      const input = car.destroyed
        ? NEUTRAL_INPUT
        : (state.inputs.get(pid) ?? NEUTRAL_INPUT);
      const boostReady =
        !car.destroyed && input.action && car.boostCooldownTicks === 0;
      if (boostReady) {
        car.boostTicksLeft = BOOST_TICKS;
        car.boostCooldownTicks = BOOST_COOLDOWN_TICKS;
      }
      const boosting = !car.destroyed && car.boostTicksLeft > 0;
      car.throttle = state.physics.applyControl(
        pid,
        { aimX: input.aimX, aimY: input.aimY, boost: boosting },
        boosting,
      ).throttle;
      car.boosting = boosting;
      car.boostTicksLeft = Math.max(0, car.boostTicksLeft - 1);
      car.boostCooldownTicks = Math.max(0, car.boostCooldownTicks - 1);
    }
  }

  private resolveCarContacts(
    contacts: readonly PhysicsContact[],
    events: SimEvent[],
  ): void {
    for (const contact of contacts) {
      if (contact.kind === "car-bill" && contact.billId !== null) {
        pickUp(this.state, contact.aPid, contact.billId, events);
        continue;
      }
      if (contact.kind === "car-base") {
        deliver(this.state, contact.aPid, events);
      }
    }
  }

  private emitTimer(tick: number, events: SimEvent[]): void {
    const { matchSeconds } = this.state.setup;
    const prev = timerRemainingMs(tick, matchSeconds);
    const now = timerRemainingMs(tick + 1, matchSeconds);
    for (const seconds of timerEventsCrossed(prev, now)) {
      events.push({ k: "timer", remainingMs: secondsToMs(seconds) });
    }
  }

  private resolveCrashfestEnd(): void {
    const { state } = this;
    if (state.setup.gameMode !== "crashfest") return;
    const survivors = state.pids.filter((pid) => !carOf(state, pid).destroyed);
    if (survivors.length > 1) return;
    this.finished = true;
    this.winners = survivors;
  }

  private carSnapshot(pid: number): CarSnapshot {
    const { state } = this;
    const body = bodyOf(state, pid);
    const car = carOf(state, pid);
    return {
      pid,
      x: body.x,
      y: body.y,
      angle: body.angle,
      vx: body.vx,
      vy: body.vy,
      hp: car.hp,
      flags: carFlags(car, state.setup.gameMode),
      cargo: car.carried.length,
      score: state.scores.get(pid) ?? 0,
    };
  }

  private placeCarInternal(
    pid: number,
    x: number,
    y: number,
    angle: number,
  ): void {
    carOf(this.state, pid);
    this.state.physics.teleportCar(pid, x, y, angle);
  }
}
