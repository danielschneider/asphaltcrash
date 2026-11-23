import { describe, expect, it } from "vitest";
import { InputBuffer } from "../../src/game/input/InputBuffer";
import type { WorldRenderer } from "../../src/game/Renderer";

import { buildStart } from "../../src/network/match/startMessage";
import { toSnapMessage } from "../../src/network/protocol/codec";
import type {
  EndMessage,
  NetworkMessage,
} from "../../src/network/protocol/messages";
import type { Transport } from "../../src/network/transport/Transport";
import type {
  ChannelKind,
  PeerEvent,
  PeerId,
  PeerRole,
} from "../../src/types/network";
import { MatchClient } from "../../src/session/MatchClient";
import type { MatchSnapshot, WorldView } from "../../src/types/game";

const HOST: PeerId = "host-peer";
const MATCH_ID = 5;
const FRAME_MS = 1000 / 60;

interface SentMessage {
  readonly message: NetworkMessage;
  readonly channel: ChannelKind;
}

class FakeTransport implements Transport {
  readonly role: PeerRole = "client";
  readonly sent: SentMessage[] = [];
  private handler: ((msg: NetworkMessage, from: PeerId) => void) | null = null;

  send(message: NetworkMessage, channel: ChannelKind): void {
    this.sent.push({ message, channel });
  }

  sendTo(_peerId: PeerId, message: NetworkMessage, channel: ChannelKind): void {
    this.sent.push({ message, channel });
  }

  onMessage(handler: (msg: NetworkMessage, from: PeerId) => void): () => void {
    this.handler = handler;
    return () => {
      this.handler = null;
    };
  }

  onPeerChange(_handler: (event: PeerEvent) => void): () => void {
    return () => undefined;
  }

  close(): void {
    this.handler = null;
  }

  deliver(message: NetworkMessage, from: PeerId = HOST): void {
    this.handler?.(message, from);
  }

  ofType(type: NetworkMessage["t"], channel: ChannelKind): NetworkMessage[] {
    return this.sent
      .filter((s) => s.message.t === type && s.channel === channel)
      .map((s) => s.message);
  }
}

class FakeRenderer implements WorldRenderer {
  readonly views: WorldView[] = [];
  readonly dts: number[] = [];

  update(view: WorldView, dtSeconds: number): void {
    this.views.push(view);
    this.dts.push(dtSeconds);
  }

  resize(): void {
    return;
  }

  destroy(): void {
    return;
  }
}

interface Harness {
  readonly client: MatchClient;
  readonly transport: FakeTransport;
  readonly renderer: FakeRenderer;
  readonly input: InputBuffer;
  readonly clock: { now: number };
  frame(atMs: number): void;
}

function makeHarness(): Harness {
  const transport = new FakeTransport();
  const renderer = new FakeRenderer();
  const input = new InputBuffer();
  const clock = { now: 0 };
  let pending: ((t: number) => void) | null = null;
  const client = new MatchClient({
    transport,
    hostPeerId: HOST,
    localPid: 0,
    renderer,
    inputBuffer: input,
    hud: { push: () => undefined },
    now: () => clock.now,
    requestFrame: (cb) => {
      pending = cb;
      return 1;
    },
    cancelFrame: () => {
      pending = null;
    },
  });
  return {
    client,
    transport,
    renderer,
    input,
    clock,
    frame(atMs: number): void {
      clock.now = atMs;
      const cb = pending;
      pending = null;
      cb?.(atMs);
    },
  };
}

function startMessage(): NetworkMessage {
  const raw = buildStart(
    {
      gameMode: "cash",
      seed: 42,
      humanPlayerIds: [0, 1],
      botPlayerIds: [2],
      botDifficulty: "normal",
      matchSeconds: 180,
    },
    MATCH_ID,
  );
  return JSON.parse(JSON.stringify(raw)) as NetworkMessage;
}

function threeCarSnapshot(tick: number): MatchSnapshot {
  const car = (pid: number) => ({
    pid,
    x: 100 + pid * 50,
    y: 200,
    angle: 0,
    vx: 0,
    vy: 0,
    hp: 100,
    flags: 0,
    cargo: 0,
    score: 0,
  });
  return {
    tick,
    timeRemainingMs: 1000,
    cars: [car(0), car(1), car(2)],
    bills: [],
  };
}

function snapMessage(tick: number): NetworkMessage {
  const wire = toSnapMessage(threeCarSnapshot(tick), 0);
  return JSON.parse(JSON.stringify(wire)) as NetworkMessage;
}

describe("MatchClient", () => {
  it("sends ready on the reliable channel after a valid start", () => {
    const h = makeHarness();
    h.client.start();
    h.transport.deliver(startMessage());
    expect(h.transport.ofType("ready", "reliable")).toEqual([
      { v: 1, t: "ready", mid: MATCH_ID },
    ]);
  });

  it("sends ready when started with an already consumed start message", () => {
    const h = makeHarness();
    h.client.start(startMessage());
    expect(h.transport.ofType("ready", "reliable")).toEqual([
      { v: 1, t: "ready", mid: MATCH_ID },
    ]);
  });

  it("ignores start from a non-host peer and invalid start payloads", () => {
    const h = makeHarness();
    h.client.start();
    h.transport.deliver(startMessage(), "intruder");
    h.transport.deliver({ v: 1, t: "start", mid: 1 } as NetworkMessage);
    expect(h.transport.ofType("ready", "reliable")).toHaveLength(0);
  });

  it("pushes snapshots so renderer receives all 3 cars", () => {
    const h = makeHarness();
    h.client.start();
    h.transport.deliver(startMessage());
    h.transport.deliver(snapMessage(10));
    h.frame(1000);
    expect(h.renderer.views).toHaveLength(1);
    expect(h.renderer.views[0]?.cars).toHaveLength(3);
    expect(h.renderer.views[0]?.cars.map((c) => c.isLocal)).toEqual([
      true,
      false,
      false,
    ]);
    expect(h.renderer.views[0]?.arena.bases).toHaveLength(3);
  });

  it("does not render before a start or snapshot arrives", () => {
    const h = makeHarness();
    h.client.start();
    h.frame(1000);
    h.transport.deliver(snapMessage(10));
    h.frame(1016);
    expect(h.renderer.views).toHaveLength(0);
  });

  it("passes a clamped frame delta to the renderer", () => {
    const h = makeHarness();
    h.client.start();
    h.transport.deliver(startMessage());
    h.transport.deliver(snapMessage(10));
    h.frame(1000);
    h.frame(1000 + FRAME_MS);
    h.frame(5000);
    expect(h.renderer.dts[0]).toBe(0);
    expect(h.renderer.dts[1]).toBeCloseTo(FRAME_MS / 1000, 6);
    expect(h.renderer.dts[2]).toBeCloseTo(0.1, 6);
  });

  it("sets finished and stores scores on end", () => {
    const h = makeHarness();
    h.client.start();
    h.transport.deliver(startMessage());
    expect(h.client.isFinished).toBe(false);
    const end: EndMessage = {
      v: 1,
      t: "end",
      mid: MATCH_ID,
      scores: [[0, 120, 0, 120]],
      winners: [0],
    };
    h.transport.deliver(end);
    expect(h.client.isFinished).toBe(true);
    expect(h.client.finalScores).toEqual([[0, 120, 0, 120]]);
  });

  it("stops the frame loop after end", () => {
    const h = makeHarness();
    h.client.start();
    h.transport.deliver(startMessage());
    h.transport.deliver({
      v: 1,
      t: "end",
      mid: MATCH_ID,
      scores: [],
      winners: [],
    } as EndMessage);
    h.transport.deliver(snapMessage(10));
    h.frame(1000);
    expect(h.renderer.views).toHaveLength(0);
  });

  it("sends input on the unreliable channel at most 30 Hz", () => {
    const h = makeHarness();
    h.client.start();
    h.transport.deliver(startMessage());
    for (let i = 0; i <= 60; i += 1) {
      h.input.write({ aimX: i % 2 === 0 ? 1 : 0.5 });
      h.frame(i * FRAME_MS);
    }
    const inputs = h.transport.ofType("in", "unreliable");
    expect(inputs.length).toBeGreaterThanOrEqual(29);
    expect(inputs.length).toBeLessThanOrEqual(31);
    expect(h.transport.ofType("in", "reliable")).toHaveLength(0);
  });

  it("stop cancels the frame loop and unsubscribes", () => {
    const h = makeHarness();
    h.client.start();
    h.transport.deliver(startMessage());
    h.client.stop();
    h.transport.deliver(snapMessage(10));
    h.frame(1000);
    expect(h.renderer.views).toHaveLength(0);
    expect(h.transport.ofType("ready", "reliable")).toHaveLength(1);
  });
});
