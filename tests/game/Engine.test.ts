import { describe, expect, it, vi, type Mock } from "vitest";
import { Engine } from "../../src/game/Engine";
import type { WorldRenderer } from "../../src/game/Renderer";
import type { InputSource } from "../../src/game/input/InputSource";
import type { MatchSimulation } from "../../src/game/sim/MatchSimulation";
import type { HudSink, HudSnapshot } from "../../src/store/hudStore";
import type { MatchSnapshot, SimEvents, WorldView } from "../../src/types/game";

const STEP_MS = 1000 / 60;

interface FakeFrames {
  readonly requestFrame: (cb: (t: number) => void) => number;
  readonly cancelFrame: (id: number) => void;
  readonly fire: (t: number) => void;
  readonly pending: () => number;
}

function createFakeFrames(): FakeFrames {
  let callback: ((t: number) => void) | null = null;
  let nextId = 1;
  let activeId: number | null = null;
  return {
    requestFrame(cb): number {
      callback = cb;
      activeId = nextId;
      nextId += 1;
      return activeId;
    },
    cancelFrame(id): void {
      if (id === activeId) {
        callback = null;
        activeId = null;
      }
    },
    fire(t): void {
      const cb = callback;
      callback = null;
      activeId = null;
      cb?.(t);
    },
    pending(): number {
      return callback ? 1 : 0;
    },
  };
}

const EMPTY_SNAPSHOT: MatchSnapshot = {
  tick: 0,
  timeRemainingMs: 180000,
  cars: [
    {
      pid: 0,
      x: 0,
      y: 0,
      angle: 0,
      vx: 0,
      vy: 0,
      hp: 100,
      flags: 0,
      cargo: 0,
      score: 0,
    },
  ],
  bills: [],
};

interface FakeSim {
  step: ReturnType<typeof vi.fn<() => SimEvents>>;
  setInput: ReturnType<typeof vi.fn>;
  snapshot: ReturnType<typeof vi.fn<() => MatchSnapshot>>;
  arena: { width: number; height: number; wallThickness: number; bases: [] };
}

function createFakeSim(): FakeSim {
  return {
    step: vi.fn<() => SimEvents>(() => []),
    setInput: vi.fn(),
    snapshot: vi.fn(() => EMPTY_SNAPSHOT),
    arena: { width: 2400, height: 1600, wallThickness: 40, bases: [] },
  };
}

function createFakeRenderer(): WorldRenderer & {
  update: Mock<(view: WorldView, dtSeconds: number) => void>;
} {
  return {
    update: vi.fn<(view: WorldView, dtSeconds: number) => void>(),
    resize: vi.fn(),
    destroy: vi.fn(),
  };
}

function createHud(): HudSink & { pushes: HudSnapshot[] } {
  const pushes: HudSnapshot[] = [];
  return {
    pushes,
    push(snapshot: HudSnapshot): void {
      pushes.push(snapshot);
    },
  };
}

function setup(): {
  frames: FakeFrames;
  sim: FakeSim;
  renderer: ReturnType<typeof createFakeRenderer>;
  hud: ReturnType<typeof createHud>;
  engine: Engine;
} {
  const frames = createFakeFrames();
  const sim = createFakeSim();
  const renderer = createFakeRenderer();
  const hud = createHud();
  const inputSources: readonly InputSource[] = [
    {
      playerId: 0,
      latest: () => ({ throttle: 1, steer: 0, action: false, seq: 1 }),
    },
  ];
  const engine = new Engine({
    // Test seam only: the fake exposes the subset of MatchSimulation the engine uses.
    sim: sim as unknown as MatchSimulation,
    renderer,
    inputSources,
    localPlayerId: 0,
    hud,
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
  });
  return { frames, sim, renderer, hud, engine };
}

describe("Engine", () => {
  it("runs one fixed step for a 60 Hz frame delta", () => {
    const { frames, sim, engine } = setup();
    engine.start();
    frames.fire(0);
    frames.fire(STEP_MS);
    expect(sim.step).toHaveBeenCalledTimes(1);
    expect(sim.setInput).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ throttle: 1 }),
    );
    engine.dispose();
  });

  it("clamps a 250 ms frame delta to at most 15 steps", () => {
    const { frames, sim, engine } = setup();
    engine.start();
    frames.fire(0);
    frames.fire(250);
    expect(sim.step.mock.calls.length).toBeGreaterThan(0);
    expect(sim.step.mock.calls.length).toBeLessThanOrEqual(15);
    engine.dispose();
  });

  it("pushes HUD every 6th step", () => {
    const { frames, hud, engine } = setup();
    engine.start();
    frames.fire(0);
    let t = 0;
    for (let i = 0; i < 12; i += 1) {
      t += STEP_MS;
      frames.fire(t);
    }
    expect(hud.pushes).toHaveLength(2);
    engine.dispose();
  });

  it("stops stepping while paused but keeps rendering", () => {
    const { frames, sim, renderer, engine } = setup();
    engine.start();
    frames.fire(0);
    engine.setPaused(true);
    frames.fire(100);
    frames.fire(200);
    expect(sim.step).not.toHaveBeenCalled();
    // Frame at t=0 renders once, plus the two paused frames.
    expect(renderer.update).toHaveBeenCalledTimes(3);
    engine.dispose();
  });

  it("stop cancels the pending frame", () => {
    const { frames, engine } = setup();
    engine.start();
    engine.stop();
    expect(frames.pending()).toBe(0);
    engine.dispose();
  });
});
