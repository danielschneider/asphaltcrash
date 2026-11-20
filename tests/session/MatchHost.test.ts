import { describe, expect, it, vi } from "vitest";
import { gameConfig } from "../../src/config/gameConfig";
import { MatchSimulation } from "../../src/game/sim/MatchSimulation";
import type { InputFrame } from "../../src/game/input/InputFrame";
import type {
  NetworkMessage,
  ScoreItem,
} from "../../src/network/protocol/messages";
import type {
  Transport,
  Unsubscribe,
} from "../../src/network/transport/Transport";
import type { ChannelKind, PeerId, PeerRole } from "../../src/types/network";
import type { MatchSetup } from "../../src/types/game";
import {
  MATCH_HOST_PHASE,
  MatchHost,
  type MatchHostDeps,
} from "../../src/session/MatchHost";

interface SentRecord {
  readonly message: NetworkMessage;
  readonly channel: ChannelKind;
  readonly peerId: PeerId | null;
}

interface FakeTransport extends Transport {
  readonly sent: SentRecord[];
}

function createFakeTransport(): FakeTransport {
  const sent: SentRecord[] = [];
  return {
    role: "host" as PeerRole,
    sent,
    send(message, channel) {
      sent.push({ message, channel, peerId: null });
    },
    sendTo(peerId, message, channel) {
      sent.push({ message, channel, peerId });
    },
    onMessage: (): Unsubscribe => () => undefined,
    onPeerChange: (): Unsubscribe => () => undefined,
    close: () => undefined,
  };
}

interface FakeTimers {
  readonly setTimeout: (handler: () => void, ms: number) => number;
  readonly clearTimeout: (handle: unknown) => void;
  readonly pending: Map<number, { handler: () => void; ms: number }>;
}

function createFakeTimers(): FakeTimers {
  const pending = new Map<number, { handler: () => void; ms: number }>();
  let nextId = 1;
  return {
    pending,
    setTimeout(handler, ms) {
      const id = nextId;
      nextId += 1;
      pending.set(id, { handler, ms });
      return id;
    },
    clearTimeout(handle) {
      if (typeof handle === "number") pending.delete(handle);
    },
  };
}

const CLIENT_PEER = "peer-client-1";
const SECOND_CLIENT_PEER = "peer-client-2";
const PID_TO_PEER: Readonly<Record<number, PeerId>> = {
  1: CLIENT_PEER,
  2: SECOND_CLIENT_PEER,
};
const PEER_TO_PID: Readonly<Record<PeerId, number>> = {
  [CLIENT_PEER]: 1,
  [SECOND_CLIENT_PEER]: 2,
};
const HOST_INPUT: InputFrame = {
  aimX: 0,
  aimY: 0,
  action: false,
  seq: 0,
};
const STEP_MS = 1000 / gameConfig.fixedStepHz;
const SHORT_MATCH_SECONDS = 2;

interface HarnessOptions {
  readonly humanPids?: readonly number[];
  readonly botPids?: readonly number[];
  matchSeconds?: number;
  readonly onFinished?: (scores: readonly ScoreItem[]) => void;
}

function createHarness(options: HarnessOptions = {}) {
  const transport = createFakeTransport();
  const timers = createFakeTimers();
  const setups: MatchSetup[] = [];
  const sims: MatchSimulation[] = [];
  const deps: MatchHostDeps = {
    transport,
    now: () => clock.now,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    newMatchId: () => 77,
    makeSim: (setup) => {
      setups.push(setup);
      const sim = new MatchSimulation(setup);
      sims.push(sim);
      return sim;
    },
    seed: 42,
    humanPids: options.humanPids ?? [0, 1],
    botPids: options.botPids ?? [2, 3],
    botDifficulty: "normal",
    matchSeconds: options.matchSeconds ?? SHORT_MATCH_SECONDS,
    pidForPeer: (peerId) => PEER_TO_PID[peerId],
    peerIdForPid: (pid) => PID_TO_PEER[pid],
    hostInput: () => HOST_INPUT,
    ...(options.onFinished ? { onFinished: options.onFinished } : {}),
  };
  const clock = { now: 0 };
  const host = new MatchHost(deps);
  return { host, transport, timers, setups, sims, clock };
}

function sentOf(
  transport: FakeTransport,
  type: NetworkMessage["t"],
): SentRecord[] {
  return transport.sent.filter((record) => record.message.t === type);
}

function readyFor(mid: number): NetworkMessage {
  return { v: 1, t: "ready", mid };
}

function inputFor(seq: number, aimX: number): NetworkMessage {
  return { v: 1, t: "in", s: seq, ax: aimX, ay: 0, a: 0 };
}

describe("MatchHost", () => {
  it("sends one start per client pid with CPU rows as bot pids", () => {
    const { host, transport, setups } = createHarness();
    host.start();
    const starts = sentOf(transport, "start");
    expect(starts).toHaveLength(1);
    expect(starts[0]?.channel).toBe("reliable");
    expect(setups[0]?.humanPlayerIds).toEqual([0, 1]);
    expect(setups[0]?.botPlayerIds).toEqual([2, 3]);
    expect(host.phase).toBe(MATCH_HOST_PHASE.waiting);
  });

  it("starts running once every client sent ready", () => {
    const { host, transport, timers } = createHarness();
    host.start();
    host.handleInbound(readyFor(77), CLIENT_PEER);
    expect(host.phase).toBe(MATCH_HOST_PHASE.running);
    expect(timers.pending.size).toBe(0);
    expect(transport.sent).toHaveLength(1);
  });

  it("ignores ready with a foreign match id", () => {
    const { host } = createHarness();
    host.start();
    expect(host.handleInbound(readyFor(5), CLIENT_PEER)).toBe(false);
    expect(host.phase).toBe(MATCH_HOST_PHASE.waiting);
  });

  it("starts anyway after matchReadyTimeoutMs without ready", () => {
    const { host, timers } = createHarness();
    host.start();
    const [timer] = [...timers.pending.values()];
    expect(timer?.ms).toBe(5000);
    expect(timer?.ms).toBe(gameConfig.matchReadyTimeoutMs);
    timers.pending.forEach((entry) => entry.handler());
    expect(host.phase).toBe(MATCH_HOST_PHASE.running);
  });

  it("sends a snapshot on unreliable every 3rd fixed step", () => {
    const { host, transport, clock } = createHarness({ botPids: [] });
    host.start();
    host.handleInbound(readyFor(77), CLIENT_PEER);
    for (let step = 1; step <= 9; step += 1) {
      clock.now = step * STEP_MS;
      host.tick(clock.now);
    }
    const snaps = sentOf(transport, "snap");
    expect(snaps).toHaveLength(3);
    expect(snaps.every((record) => record.channel === "unreliable")).toBe(true);
  });

  it("clamps frame delta to maxFrameDeltaMs", () => {
    const { host, transport, clock } = createHarness({ botPids: [] });
    host.start();
    host.handleInbound(readyFor(77), CLIENT_PEER);
    clock.now = 60_000;
    host.tick(clock.now);
    const frameDeltaSteps = Math.round(gameConfig.maxFrameDeltaMs / STEP_MS);
    expect(sentOf(transport, "snap")).toHaveLength(
      Math.floor(frameDeltaSteps / 3),
    );
  });

  it("applies client input to the client car", () => {
    const { host, sims, clock } = createHarness({ botPids: [] });
    host.start();
    host.handleInbound(readyFor(77), CLIENT_PEER);
    const sim = sims[0];
    expect(sim).toBeDefined();
    const setInput = vi.spyOn(sim as MatchSimulation, "setInput");
    expect(host.handleInbound(inputFor(1, 100), CLIENT_PEER)).toBe(true);
    clock.now = STEP_MS;
    host.tick(clock.now);
    expect(setInput).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ aimX: 1, seq: 1 }),
    );
  });

  it("ignores input from unknown peers", () => {
    const { host } = createHarness();
    host.start();
    expect(host.handleInbound(inputFor(1, 100), "stranger")).toBe(false);
  });

  it("sends end on reliable when the timer reaches zero", () => {
    const { host, transport, clock } = createHarness({ botPids: [] });
    host.start();
    host.handleInbound(readyFor(77), CLIENT_PEER);
    const totalSteps = SHORT_MATCH_SECONDS * gameConfig.fixedStepHz;
    for (let step = 1; step <= totalSteps; step += 1) {
      clock.now = step * STEP_MS;
      host.tick(clock.now);
    }
    expect(host.phase).toBe(MATCH_HOST_PHASE.finished);
    const ends = sentOf(transport, "end");
    expect(ends).toHaveLength(1);
    expect(ends[0]?.channel).toBe("reliable");
    const end = ends[0]?.message;
    expect(end?.t === "end" && end.mid).toBe(77);
    expect(end?.t === "end" && end.winners.length).toBeGreaterThan(0);
  });

  it("delivers start, snapshots and end only to the target client peer", () => {
    const { host, transport, clock } = createHarness({
      humanPids: [0, 1, 2],
      botPids: [3],
      matchSeconds: 1,
    });
    host.start();
    host.handleInbound(readyFor(77), CLIENT_PEER);
    host.handleInbound(readyFor(77), SECOND_CLIENT_PEER);
    const totalSteps = gameConfig.fixedStepHz;
    for (let step = 1; step <= totalSteps; step += 1) {
      clock.now = step * STEP_MS;
      host.tick(clock.now);
    }
    expect(transport.sent.every((record) => record.peerId !== null)).toBe(true);
    const toFirst = transport.sent.filter((r) => r.peerId === CLIENT_PEER);
    const toSecond = transport.sent.filter(
      (r) => r.peerId === SECOND_CLIENT_PEER,
    );
    expect(toFirst.map((r) => r.message.t)).toContain("start");
    expect(toSecond.map((r) => r.message.t)).toContain("start");
    expect(toFirst.map((r) => r.message.t)).toContain("end");
    expect(toSecond.map((r) => r.message.t)).toContain("end");
    expect(toFirst.filter((r) => r.message.t === "snap")).toHaveLength(
      toSecond.filter((r) => r.message.t === "snap").length,
    );
  });

  it("does not step before running", () => {
    const { host, transport, clock } = createHarness({ botPids: [] });
    host.start();
    clock.now = 10 * STEP_MS;
    host.tick(clock.now);
    expect(transport.sent).toHaveLength(1);
  });

  it("calls onFinished once with the end scores and stops emitting snapshots", () => {
    const onFinished = vi.fn();
    const { host, transport, clock } = createHarness({
      botPids: [],
      matchSeconds: 1,
      onFinished,
    });
    host.start();
    host.handleInbound(readyFor(77), CLIENT_PEER);
    for (let step = 1; step <= gameConfig.fixedStepHz; step += 1) {
      clock.now = step * STEP_MS;
      host.tick(clock.now);
    }
    expect(onFinished).toHaveBeenCalledTimes(1);
    const end = sentOf(transport, "end")[0]?.message;
    expect(onFinished).toHaveBeenCalledWith(
      end?.t === "end" ? end.scores : undefined,
    );
    const snapsBefore = sentOf(transport, "snap").length;
    clock.now += STEP_MS * 30;
    host.tick(clock.now);
    expect(sentOf(transport, "snap")).toHaveLength(snapsBefore);
  });

  it("exposes a read-only snapshot and arena of the running sim", () => {
    const { host, sims } = createHarness({ humanPids: [0, 1], botPids: [2] });
    host.start();
    const snapshot = host.snapshot();
    expect(snapshot.cars.map((car) => car.pid)).toEqual([0, 1, 2]);
    expect(snapshot).toEqual(sims[0]?.snapshot());
    expect(host.arena.bases).toHaveLength(3);
  });
});
