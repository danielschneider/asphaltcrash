import { gameConfig } from "../config/gameConfig";
import type { HudSink, HudSnapshot } from "../store/hudStore";
import type { MatchSnapshot, SimEvent } from "../types/game";
import type { MatchSimulation } from "./sim/MatchSimulation";
import type { WorldRenderer } from "./Renderer";
import type { InputSource } from "./input/InputSource";
import { buildWorldView } from "./WorldView";

export interface EngineDeps {
  readonly sim: MatchSimulation;
  readonly renderer: WorldRenderer;
  readonly inputSources: readonly InputSource[];
  readonly localPlayerId: number;
  readonly hud: HudSink;
  readonly requestFrame?: (cb: (t: number) => void) => number;
  readonly cancelFrame?: (id: number) => void;
}

type FrameCallback = (t: number) => void;

const STEP_SECONDS = 1 / gameConfig.fixedStepHz;
// Absorbs float drift when summed frame deltas land just under a whole step.
const STEP_EPSILON_SECONDS = 1e-6;
const HUD_EVERY_STEPS = Math.round(gameConfig.fixedStepHz / gameConfig.hudHz);
const MAX_STEPS_PER_FRAME = 20;
const FEED_LENGTH = 3;

function defaultRequestFrame(cb: FrameCallback): number {
  return globalThis.requestAnimationFrame(cb);
}

function defaultCancelFrame(id: number): void {
  globalThis.cancelAnimationFrame(id);
}

function subscribeVisibility(listener: (hidden: boolean) => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  const handler = (): void => listener(document.visibilityState === "hidden");
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

function playerLabel(pid: number): string {
  return `P${pid + 1}`;
}

function describeEvent(event: SimEvent): string | null {
  switch (event.k) {
    case "hit":
      return event.impulse >= gameConfig.hitEventThreshold
        ? `${playerLabel(event.attackerPid)} hit ${playerLabel(event.victimPid)}`
        : null;
    case "kill":
      return `${playerLabel(event.attackerPid)} destroyed ${playerLabel(event.victimPid)}`;
    case "deliv":
      return `${playerLabel(event.pid)} delivered ${event.amount}`;
    default:
      return null;
  }
}

function buildHud(
  snapshot: MatchSnapshot,
  localPlayerId: number,
  feed: readonly string[],
  paused: boolean,
): HudSnapshot {
  const local = snapshot.cars.find((car) => car.pid === localPlayerId);
  return {
    remainingMs: snapshot.timeRemainingMs,
    score: local?.score ?? 0,
    cargo: local?.cargo ?? 0,
    hp: local?.hp ?? 0,
    scores: snapshot.cars.map((car) => ({ pid: car.pid, score: car.score })),
    feed: [...feed],
    paused,
  };
}

export class Engine {
  private readonly deps: EngineDeps;
  private readonly requestFrame: (cb: FrameCallback) => number;
  private readonly cancelFrame: (id: number) => void;
  private readonly feed: string[] = [];
  private readonly detachVisibility: () => void;
  private running = false;
  private userPaused = false;
  private hiddenPaused = false;
  private frameHandle: number | null = null;
  private lastMs: number | null = null;
  private accumulator = 0;
  private stepCount = 0;

  constructor(deps: EngineDeps) {
    this.deps = deps;
    this.requestFrame = deps.requestFrame ?? defaultRequestFrame;
    this.cancelFrame = deps.cancelFrame ?? defaultCancelFrame;
    this.detachVisibility = subscribeVisibility(this.handleVisibilityChange);
  }

  get paused(): boolean {
    return this.userPaused || this.hiddenPaused;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMs = null;
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle === null) return;
    this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
  }

  setPaused(on: boolean): void {
    const wasPaused = this.paused;
    this.userPaused = on;
    if (this.paused !== wasPaused) this.pushHud();
  }

  dispose(): void {
    this.stop();
    this.detachVisibility();
    this.feed.length = 0;
    this.accumulator = 0;
    this.lastMs = null;
  }

  private readonly handleFrame = (now: number): void => {
    this.frameHandle = null;
    if (!this.running) return;
    this.scheduleFrame();
    const deltaSeconds = this.consumeDelta(now);
    const hudDue = this.paused
      ? this.discardAccumulator()
      : this.advance(deltaSeconds);
    this.render(hudDue, deltaSeconds);
  };

  private readonly handleVisibilityChange = (hidden: boolean): void => {
    const wasPaused = this.paused;
    this.hiddenPaused = hidden;
    this.lastMs = null;
    if (this.paused !== wasPaused) this.pushHud();
  };

  private scheduleFrame(): void {
    this.frameHandle = this.requestFrame(this.handleFrame);
  }

  private consumeDelta(now: number): number {
    const last = this.lastMs;
    this.lastMs = now;
    if (last === null) return 0;
    const clampedMs = Math.min(
      Math.max(now - last, 0),
      gameConfig.maxFrameDeltaMs,
    );
    return clampedMs / 1000;
  }

  private discardAccumulator(): boolean {
    this.accumulator = 0;
    return false;
  }

  private advance(deltaSeconds: number): boolean {
    this.accumulator += deltaSeconds;
    let hudDue = false;
    let steps = 0;
    while (
      this.accumulator + STEP_EPSILON_SECONDS >= STEP_SECONDS &&
      steps < MAX_STEPS_PER_FRAME
    ) {
      this.stepSim();
      this.accumulator -= STEP_SECONDS;
      steps += 1;
      if (this.stepCount % HUD_EVERY_STEPS === 0) hudDue = true;
    }
    if (this.accumulator >= STEP_SECONDS) this.accumulator = 0;
    return hudDue;
  }

  private stepSim(): void {
    const { sim, inputSources } = this.deps;
    for (const source of inputSources) {
      sim.setInput(source.playerId, source.latest());
    }
    for (const event of sim.step()) {
      this.recordFeed(event);
    }
    this.stepCount += 1;
  }

  private recordFeed(event: SimEvent): void {
    const text = describeEvent(event);
    if (text === null) return;
    this.feed.push(text);
    if (this.feed.length > FEED_LENGTH) this.feed.shift();
  }

  private render(hudDue: boolean, dtSeconds: number): void {
    const { sim, renderer, localPlayerId } = this.deps;
    const snapshot = sim.snapshot();
    renderer.update(
      buildWorldView(snapshot, sim.arena, localPlayerId),
      dtSeconds,
    );
    if (hudDue) this.pushHud(snapshot);
  }

  private pushHud(snapshot: MatchSnapshot = this.deps.sim.snapshot()): void {
    const { hud, localPlayerId } = this.deps;
    hud.push(buildHud(snapshot, localPlayerId, this.feed, this.paused));
  }
}
