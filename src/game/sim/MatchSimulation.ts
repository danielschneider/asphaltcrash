import { gameConfig } from "../../config/gameConfig";
import {
  type ArenaView,
  type BaseView,
  type BillSnapshot,
  type CarSnapshot,
  type MatchSetup,
  type MatchSnapshot,
  type SimEvent,
  type SimEvents,
} from "../../types/game";
import { buildArenaView, spawnFor } from "../arena";
import { BotController, type BotPerception } from "../bots/BotController";
import { NEUTRAL_INPUT, type InputFrame } from "../input/InputFrame";
import {
  PhysicsWorld,
  type CarBodyState,
  type PhysicsContact,
} from "../Physics";
import {
  applyDamage,
  attributeKill,
  canDeliver,
  canPickUp,
  isContactOnCooldown,
  nextSpawnTick,
  ticksFromMs,
  wallDamageMultiplier,
  type DamageConfig,
} from "../Rules";
import { BillSpawner, type BaseRect } from "./BillSpawner";
import {
  carFlags,
  createCarState,
  isInvulnerable,
  recordHit,
  type CarState,
} from "./CarState";
import { createRng } from "./Rng";
import {
  scoreDelivery,
  scoreKill,
  timerEventsCrossed,
  timerRemainingMs,
} from "./Scoring";
import { secondsToMs } from "./time";

const MAX_PID = gameConfig.maxCars - 1;
const BOOST_TICKS = ticksFromMs(secondsToMs(gameConfig.boostSeconds));
const BOOST_COOLDOWN_TICKS = ticksFromMs(
  secondsToMs(gameConfig.boostCooldownSeconds),
);
const INVULNERABLE_TICKS = ticksFromMs(
  secondsToMs(gameConfig.invulnerableAfterRespawnSeconds),
);
const DAMAGE_CONFIG: DamageConfig = {
  damageThresholdImpulse: gameConfig.damageThresholdImpulse,
  damageFactor: gameConfig.damageFactor,
  maxDamagePerHit: gameConfig.maxDamagePerHit,
};

export interface MatchTestHook {
  readonly placeCar: (pid: number, x: number, y: number, angle: number) => void;
}

const testHooks = new WeakMap<MatchSimulation, MatchTestHook>();

// Internal test hook used by src/game/sim/testing.ts. Not part of the public simulation API.
export function getMatchTestHook(
  sim: MatchSimulation,
): MatchTestHook | undefined {
  return testHooks.get(sim);
}

function validatePids(setup: MatchSetup): void {
  const seen = new Set<number>();
  for (const pid of [...setup.humanPlayerIds, ...setup.botPlayerIds]) {
    if (!Number.isInteger(pid) || pid < 0 || pid > MAX_PID || seen.has(pid)) {
      throw new Error(`MatchSimulation: invalid or duplicate player id ${pid}`);
    }
    seen.add(pid);
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

function isInsideBase(body: CarBodyState, base: BaseView): boolean {
  return (
    Math.abs(body.x - base.x) <= base.width / 2 &&
    Math.abs(body.y - base.y) <= base.height / 2
  );
}

function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

function byBillId(a: BillSnapshot, b: BillSnapshot): number {
  return a.id - b.id;
}

export class MatchSimulation {
  private readonly setup: MatchSetup;
  private readonly arenaView: ArenaView;
  private readonly physics: PhysicsWorld;
  private readonly spawner: BillSpawner;
  private readonly pids: readonly number[];
  private readonly cars = new Map<number, CarState>();
  private readonly bots = new Map<number, BotController>();
  private readonly bills = new Map<number, BillSnapshot>();
  private readonly scores = new Map<number, number>();
  private readonly inputs = new Map<number, InputFrame>();
  private readonly contactTicks = new Map<string, number>();
  private currentTick = 0;
  private nextBillIdValue = 1;
  private lastSpawnTick = 0;

  constructor(setup: MatchSetup) {
    validatePids(setup);
    this.setup = setup;
    this.arenaView = buildArenaView(setup.humanPlayerIds, setup.botPlayerIds);
    this.pids = [...setup.humanPlayerIds, ...setup.botPlayerIds].sort(
      (a, b) => a - b,
    );
    this.physics = new PhysicsWorld(this.arenaView, this.arenaView.bases);
    this.spawner = new BillSpawner(
      createRng(setup.seed),
      this.arenaView,
      this.arenaView.bases.map(toSpawnRect),
    );
    for (const pid of this.pids) {
      const spawn = spawnFor(pid);
      this.cars.set(pid, createCarState(pid, gameConfig.maxHealth));
      this.scores.set(pid, 0);
      this.physics.addCar(pid, spawn.x, spawn.y, spawn.angle);
    }
    for (const pid of setup.botPlayerIds) {
      const rng = createRng(setup.seed + (pid + 1) * gameConfig.botSeedStride);
      this.bots.set(pid, new BotController(pid, setup.botDifficulty, rng));
    }
    testHooks.set(this, {
      placeCar: (pid, x, y, angle) => this.placeCarInternal(pid, x, y, angle),
    });
  }

  get tick(): number {
    return this.currentTick;
  }

  get arena(): ArenaView {
    return this.arenaView;
  }

  setInput(playerId: number, input: InputFrame): void {
    if (!this.setup.humanPlayerIds.includes(playerId)) return;
    this.inputs.set(playerId, input);
  }

  inputFor(playerId: number): InputFrame {
    return this.inputs.get(playerId) ?? NEUTRAL_INPUT;
  }

  step(): SimEvents {
    const tick = this.currentTick;
    const events: SimEvent[] = [];
    this.decideBots();
    this.applyControls();
    const contacts = this.physics.step();
    this.resolveDamage(contacts, tick, events);
    this.resolveDestruction(tick, events);
    this.resolveRespawns(tick, events);
    this.resolveCarContacts(contacts, events);
    this.spawnNewBill(tick, events);
    this.emitTimer(tick, events);
    this.currentTick += 1;
    return events;
  }

  snapshot(): MatchSnapshot {
    return {
      tick: this.currentTick,
      timeRemainingMs: timerRemainingMs(
        this.currentTick,
        this.setup.matchSeconds,
      ),
      cars: this.pids.map((pid) => this.carSnapshot(pid)),
      bills: this.sortedBills().map((bill) => ({ ...bill })),
    };
  }

  private carOf(pid: number): CarState {
    const car = this.cars.get(pid);
    if (car === undefined) {
      throw new Error(`MatchSimulation: unknown car ${pid}`);
    }
    return car;
  }

  private bodyOf(pid: number): CarBodyState {
    const body = this.physics.getCar(pid);
    if (body === null) {
      throw new Error(`MatchSimulation: missing physics body ${pid}`);
    }
    return body;
  }

  private baseOf(pid: number): BaseView | undefined {
    return this.arenaView.bases.find((base) => base.pid === pid);
  }

  private sortedBills(): BillSnapshot[] {
    return [...this.bills.values()].sort(byBillId);
  }

  private allocBillId(): number {
    const id = this.nextBillIdValue;
    this.nextBillIdValue += 1;
    return id;
  }

  private registerBill(bill: BillSnapshot, events: SimEvent[]): void {
    this.physics.addBill(bill.id, bill.x, bill.y);
    this.bills.set(bill.id, bill);
    events.push({
      k: "billNew",
      id: bill.id,
      x: bill.x,
      y: bill.y,
      value: bill.value,
    });
  }

  private decideBots(): void {
    for (const [pid, bot] of this.bots) {
      const car = this.carOf(pid);
      if (car.destroyed) {
        this.inputs.set(pid, NEUTRAL_INPUT);
        continue;
      }
      this.inputs.set(pid, bot.decide(this.perceptionFor(pid)));
    }
  }

  private perceptionFor(pid: number): BotPerception {
    const body = this.bodyOf(pid);
    const car = this.carOf(pid);
    const base = this.baseOf(pid);
    const enemies = this.pids
      .filter((other) => other !== pid && !this.carOf(other).destroyed)
      .map((other) => ({
        pid: other,
        x: this.bodyOf(other).x,
        y: this.bodyOf(other).y,
        hp: this.carOf(other).hp,
      }));
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
      bills: this.sortedBills(),
      enemies,
      tick: this.currentTick,
      fallback: { x: gameConfig.arenaWidth / 2, y: gameConfig.arenaHeight / 2 },
    };
  }

  private applyControls(): void {
    for (const pid of this.pids) {
      const car = this.carOf(pid);
      const input = car.destroyed
        ? NEUTRAL_INPUT
        : (this.inputs.get(pid) ?? NEUTRAL_INPUT);
      const boostReady =
        !car.destroyed && input.action && car.boostCooldownTicks === 0;
      if (boostReady) {
        car.boostTicksLeft = BOOST_TICKS;
        car.boostCooldownTicks = BOOST_COOLDOWN_TICKS;
      }
      const boosting = !car.destroyed && car.boostTicksLeft > 0;
      car.throttle = this.physics.applyControl(
        pid,
        { aimX: input.aimX, aimY: input.aimY, boost: boosting },
        boosting,
      ).throttle;
      car.boosting = boosting;
      car.boostTicksLeft = Math.max(0, car.boostTicksLeft - 1);
      car.boostCooldownTicks = Math.max(0, car.boostCooldownTicks - 1);
    }
  }

  private resolveDamage(
    contacts: readonly PhysicsContact[],
    tick: number,
    events: SimEvent[],
  ): void {
    for (const contact of contacts) {
      if (contact.kind === "car-wall") {
        this.damageFromWall(
          contact.aPid,
          contact.impulse,
          contact.frontImpact ?? 0,
          tick,
        );
        continue;
      }
      if (
        contact.kind === "car-car" &&
        contact.bPid !== null &&
        contact.rammerPid !== null
      ) {
        this.damageFromCarCar(
          contact.aPid,
          contact.bPid,
          contact.impulse,
          contact.rammerPid,
          tick,
          events,
        );
      }
    }
  }

  private damageFromWall(
    pid: number,
    impulse: number,
    frontImpact: number,
    tick: number,
  ): void {
    const key = `${pid}:wall`;
    if (isContactOnCooldown(this.contactTicks.get(key), tick)) return;
    const damage =
      applyDamage(impulse, DAMAGE_CONFIG) * wallDamageMultiplier(frontImpact);
    if (damage <= 0) return;
    this.contactTicks.set(key, tick);
    this.applyHit(pid, null, damage, impulse, tick);
  }

  private damageFromCarCar(
    aPid: number,
    bPid: number,
    impulse: number,
    rammerPid: number,
    tick: number,
    events: SimEvent[],
  ): void {
    if (this.carOf(aPid).destroyed || this.carOf(bPid).destroyed) return;
    const key = pairKey(aPid, bPid);
    if (isContactOnCooldown(this.contactTicks.get(key), tick)) return;
    const damage = applyDamage(impulse, DAMAGE_CONFIG);
    if (damage <= 0) return;
    this.contactTicks.set(key, tick);
    const attackerPid = rammerPid;
    const victimPid = attackerPid === aPid ? bPid : aPid;
    if (impulse >= gameConfig.hitEventThreshold) {
      events.push({ k: "hit", attackerPid, victimPid, impulse });
    }
    this.applyHit(victimPid, attackerPid, damage, impulse, tick);
    this.applyHit(
      attackerPid,
      victimPid,
      damage * gameConfig.rammerDamageShare,
      impulse,
      tick,
    );
  }

  private applyHit(
    victimPid: number,
    attackerPid: number | null,
    damage: number,
    impulse: number,
    tick: number,
  ): void {
    const car = this.carOf(victimPid);
    if (car.destroyed || isInvulnerable(car, tick)) return;
    car.hp = Math.max(0, car.hp - damage);
    if (attackerPid !== null) {
      recordHit(car, { attackerPid, tick, impulse }, tick);
    }
  }

  private resolveDestruction(tick: number, events: SimEvent[]): void {
    for (const pid of this.pids) {
      const car = this.carOf(pid);
      if (car.destroyed || car.hp > 0) continue;
      this.destroyCar(car, tick, events);
    }
  }

  private destroyCar(car: CarState, tick: number, events: SimEvent[]): void {
    const { pid } = car;
    car.destroyed = true;
    car.respawnTick = nextSpawnTick(tick);
    car.boostTicksLeft = 0;
    car.boosting = false;
    car.throttle = 0;
    this.physics.setCarFrozen(pid, true);

    const { x, y } = this.bodyOf(pid);
    const dropped = [...car.carried];
    car.carried = [];
    if (dropped.length > 0) {
      events.push({ k: "drop", pid, count: dropped.length });
      for (const value of dropped) {
        this.registerBill({ id: this.allocBillId(), x, y, value }, events);
      }
    }

    const attackerPid = attributeKill(car.hits, pid, tick);
    car.hits = [];
    if (attackerPid === null) return;
    scoreKill(this.scores, attackerPid);
    events.push({ k: "kill", attackerPid, victimPid: pid });
  }

  private resolveRespawns(tick: number, events: SimEvent[]): void {
    for (const pid of this.pids) {
      const car = this.carOf(pid);
      if (!car.destroyed || tick < car.respawnTick) continue;
      const spawn = spawnFor(pid);
      this.physics.teleportCar(pid, spawn.x, spawn.y, spawn.angle);
      this.physics.setCarFrozen(pid, false);
      car.destroyed = false;
      car.hp = gameConfig.maxHealth;
      car.carried = [];
      car.invulnerableUntilTick = tick + INVULNERABLE_TICKS;
      events.push({
        k: "respawn",
        pid,
        x: spawn.x,
        y: spawn.y,
        angle: spawn.angle,
      });
    }
  }

  private resolveCarContacts(
    contacts: readonly PhysicsContact[],
    events: SimEvent[],
  ): void {
    for (const contact of contacts) {
      if (contact.kind === "car-bill" && contact.billId !== null) {
        this.pickUp(contact.aPid, contact.billId, events);
        continue;
      }
      if (contact.kind === "car-base") {
        this.deliver(contact.aPid, events);
      }
    }
  }

  private pickUp(pid: number, billId: number, events: SimEvent[]): void {
    const car = this.carOf(pid);
    const bill = this.bills.get(billId);
    if (car.destroyed || bill === undefined || !canPickUp(car.carried.length))
      return;
    this.physics.removeBill(billId);
    this.bills.delete(billId);
    car.carried.push(bill.value);
    events.push({ k: "pick", pid, billId, value: bill.value });
  }

  private deliver(pid: number, events: SimEvent[]): void {
    const car = this.carOf(pid);
    const base = this.baseOf(pid);
    if (car.destroyed || base === undefined) return;
    if (!isInsideBase(this.bodyOf(pid), base)) return;
    if (!canDeliver(pid, car.carried.length, pid)) return;
    const amount = car.carried.reduce((sum, value) => sum + value, 0);
    scoreDelivery(this.scores, pid, amount);
    car.carried = [];
    events.push({ k: "deliv", pid, amount });
  }

  private spawnNewBill(tick: number, events: SimEvent[]): void {
    const spawned = this.spawner.maybeSpawn(
      tick,
      this.bills.size,
      this.lastSpawnTick,
      () => this.allocBillId(),
    );
    if (spawned === null) return;
    this.lastSpawnTick = tick;
    this.registerBill(spawned, events);
  }

  private emitTimer(tick: number, events: SimEvent[]): void {
    const { matchSeconds } = this.setup;
    const prev = timerRemainingMs(tick, matchSeconds);
    const now = timerRemainingMs(tick + 1, matchSeconds);
    for (const seconds of timerEventsCrossed(prev, now)) {
      events.push({ k: "timer", remainingMs: secondsToMs(seconds) });
    }
  }

  private carSnapshot(pid: number): CarSnapshot {
    const body = this.bodyOf(pid);
    const car = this.carOf(pid);
    return {
      pid,
      x: body.x,
      y: body.y,
      angle: body.angle,
      vx: body.vx,
      vy: body.vy,
      hp: car.hp,
      flags: carFlags(car),
      cargo: car.carried.length,
      score: this.scores.get(pid) ?? 0,
    };
  }

  private placeCarInternal(
    pid: number,
    x: number,
    y: number,
    angle: number,
  ): void {
    this.carOf(pid);
    this.physics.teleportCar(pid, x, y, angle);
  }
}
