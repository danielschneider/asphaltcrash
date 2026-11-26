import { debugLog } from "../config/debugLog";
import { gameConfig } from "../config/gameConfig";
import type { InputFrame } from "../game/input/InputFrame";
import type { MatchSimulation } from "../game/sim/MatchSimulation";
import { timerRemainingMs } from "../game/sim/Scoring";
import { StateInterpolator } from "../game/sim/StateInterpolator";
import { resolveWinners } from "../game/WorldView";
import { InputReceiver } from "../network/match/InputReceiver";
import { SnapshotPump } from "../network/match/SnapshotPump";
import { buildStart } from "../network/match/startMessage";
import {
  PROTOCOL_VERSION,
  type EndMessage,
  type NetworkMessage,
  type ScoreItem,
} from "../network/protocol/messages";
import { validateReady } from "../network/protocol/validate";
import {
  classifyConnectivity,
  JitterTracker,
  makePong,
} from "../network/sync/PingPong";
import type { ConnectivitySnapshot } from "../store/hudStore";
import type { Transport } from "../network/transport/Transport";
import type {
  ArenaView,
  BotDifficulty,
  GameMode,
  MatchSetup,
  MatchSnapshot,
} from "../types/game";
import type { ChannelKind, PeerId } from "../types/network";

export const MATCH_HOST_PHASE = {
  idle: "idle",
  waiting: "waiting",
  running: "running",
  finished: "finished",
} as const;

export type MatchHostPhase =
  (typeof MATCH_HOST_PHASE)[keyof typeof MATCH_HOST_PHASE];

export interface MatchHostDeps {
  readonly transport: Transport;
  readonly now: () => number;
  readonly setTimeout: (handler: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly newMatchId: () => number;
  readonly makeSim: (setup: MatchSetup) => MatchSimulation;
  readonly seed: number;
  readonly humanPids: readonly number[];
  readonly botPids: readonly number[];
  readonly botDifficulty: BotDifficulty;
  readonly matchSeconds: number;
  readonly gameMode: GameMode;
  readonly names?: ReadonlyMap<number, string>;
  readonly pidForPeer: (peerId: PeerId) => number | undefined;
  readonly peerIdForPid: (pid: number) => PeerId | undefined;
  readonly hostInput: () => InputFrame;
  readonly onFinished?: (
    scores: readonly ScoreItem[],
    winners: readonly number[],
  ) => void;
}

const HOST_PID = 0;
const STEP_MS = 1000 / gameConfig.fixedStepHz;
const STEP_EPSILON_MS = 1e-6;
const MAX_CATCHUP_STEPS = 20;
const MAX_BACKLOG_MS = 5000;

export class MatchHost {
  private readonly deps: MatchHostDeps;
  private readonly setup: MatchSetup;
  private readonly sim: MatchSimulation;
  private readonly clientPids: readonly number[];
  private readonly receiver = new InputReceiver();
  private readonly acks = new Map<number, number>();
  private readonly pump: SnapshotPump;
  private readonly interpolator: StateInterpolator;
  private readonly readyPids = new Set<number>();
  private phaseValue: MatchHostPhase = MATCH_HOST_PHASE.idle;
  private matchId = 0;
  private readyTimer: unknown = null;
  private lastNowMs = 0;
  private accumulatorMs = 0;
  private backlogMs = 0;
  private snapsSent = 0;
  private readonly pingArrivalMs = new Map<number, number>();
  private readonly pingIntervals = new Map<number, JitterTracker>();

  constructor(deps: MatchHostDeps) {
    this.deps = deps;
    this.setup = {
      seed: deps.seed,
      humanPlayerIds: deps.humanPids,
      botPlayerIds: deps.botPids,
      botDifficulty: deps.botDifficulty,
      gameMode: deps.gameMode,
      matchSeconds: deps.matchSeconds,
    };
    this.clientPids = deps.humanPids.filter((pid) => pid !== HOST_PID);
    this.sim = deps.makeSim(this.setup);
    this.pump = new SnapshotPump(this.sim, this.acks);
    this.interpolator = new StateInterpolator(this.sim.snapshot());
  }

  get phase(): MatchHostPhase {
    return this.phaseValue;
  }

  get arena(): ArenaView {
    return this.sim.arena;
  }

  get carNames(): ReadonlyMap<number, string> {
    return this.deps.names ?? new Map();
  }

  get gameMode(): GameMode {
    return this.sim.gameMode;
  }

  snapshot(): MatchSnapshot {
    return this.sim.snapshot();
  }

  // Host-local render state: interpolated between the last two sim steps at accumulator / STEP. Read-only for sim.
  renderSnapshot(): MatchSnapshot {
    return this.interpolator.sample(this.accumulatorMs / STEP_MS);
  }

  start(): void {
    if (this.phaseValue !== MATCH_HOST_PHASE.idle) return;
    this.matchId = this.deps.newMatchId();
    this.phaseValue = MATCH_HOST_PHASE.waiting;
    const message = buildStart(this.setup, this.matchId, this.carNames);
    debugLog(
      "mp:host",
      () =>
        `start sent clients=${this.clientPids.length} cars=${this.sim.snapshot().cars.length}`,
    );
    for (const pid of this.clientPids) {
      this.sendToPid(pid, message, "reliable");
    }
    if (this.clientPids.length === 0) {
      this.markRunning();
      return;
    }
    this.readyTimer = this.deps.setTimeout(() => {
      this.readyTimer = null;
      debugLog("mp:host", "ready timeout -> running anyway");
      this.markRunning();
    }, gameConfig.matchReadyTimeoutMs);
  }

  // Match time follows wall time. Elapsed time beyond maxFrameDeltaMs is kept as backlog and drained over later calls, so a stall does not permanently lose match time. Backlog is capped at MAX_BACKLOG_MS.
  tick(nowMs: number): void {
    if (this.phaseValue !== MATCH_HOST_PHASE.running) return;
    const elapsedMs = Math.max(nowMs - this.lastNowMs, 0);
    this.lastNowMs = nowMs;
    this.backlogMs = Math.min(this.backlogMs + elapsedMs, MAX_BACKLOG_MS);
    const drainMs = Math.min(this.backlogMs, gameConfig.maxFrameDeltaMs);
    this.backlogMs -= drainMs;
    this.accumulatorMs += drainMs;
    let steps = 0;
    while (
      this.phaseValue === MATCH_HOST_PHASE.running &&
      this.accumulatorMs + STEP_EPSILON_MS >= STEP_MS &&
      steps < MAX_CATCHUP_STEPS
    ) {
      this.accumulatorMs -= STEP_MS;
      this.stepOnce(nowMs);
      steps += 1;
    }
  }

  handleInbound(msg: NetworkMessage, fromPeerId: PeerId): boolean {
    const pid = this.deps.pidForPeer(fromPeerId);
    if (pid === undefined || !this.clientPids.includes(pid)) return false;
    if (msg.t === "ping") {
      if (!Number.isFinite(msg.c)) return false;
      this.recordPing(pid, this.deps.now());
      this.deps.transport.sendTo(
        fromPeerId,
        makePong(msg, this.deps.now()),
        "reliable",
      );
      return true;
    }
    if (msg.t === "in") {
      return this.receiver.accept(pid, msg, this.deps.now());
    }
    if (msg.t === "ready") {
      return this.handleReady(msg, pid);
    }
    return false;
  }

  private handleReady(msg: NetworkMessage, pid: number): boolean {
    if (this.phaseValue !== MATCH_HOST_PHASE.waiting) return false;
    const result = validateReady(msg, this.matchId);
    debugLog("mp:host", () => `ready received ok=${result.ok}`);
    if (!result.ok) return false;
    this.readyPids.add(pid);
    if (this.readyPids.size === this.clientPids.length) {
      this.markRunning();
    }
    return true;
  }

  private markRunning(): void {
    if (this.readyTimer !== null) {
      this.deps.clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    this.phaseValue = MATCH_HOST_PHASE.running;
    this.lastNowMs = this.deps.now();
    this.accumulatorMs = 0;
    this.backlogMs = 0;
    debugLog(
      "mp:host",
      () => `running ready=${this.readyPids.size}/${this.clientPids.length}`,
    );
  }

  private stepOnce(nowMs: number): void {
    this.sim.setInput(HOST_PID, this.deps.hostInput());
    for (const pid of this.clientPids) {
      this.sim.setInput(pid, this.receiver.latest(pid, nowMs));
    }
    this.sim.step();
    this.interpolator.push(this.sim.snapshot());
    const tick = this.sim.tick;
    if (this.pump.due(tick)) {
      this.broadcastSnapshots();
    }
    if (tick % 60 === 0) {
      debugLog(
        "mp:host",
        () =>
          `tick=${tick} cars=${this.sim.snapshot().cars.length} snapsSent=${this.snapsSent}`,
      );
    }
    if (
      this.sim.isFinished ||
      (this.setup.gameMode !== "crashfest" &&
        timerRemainingMs(tick, this.setup.matchSeconds) === 0)
    ) {
      this.finish();
    }
  }

  private broadcastSnapshots(): void {
    const snapshot = this.pump.capture();
    for (const pid of this.clientPids) {
      this.acks.set(pid, this.receiver.lastSeq(pid));
      this.sendToPid(
        pid,
        this.pump.buildSnapshotMessage(snapshot, pid),
        "unreliable",
      );
      this.snapsSent += 1;
    }
  }

  connectivity(nowMs: number): ConnectivitySnapshot | null {
    if (this.clientPids.length === 0) return null;
    let worstRtt = 0;
    let worstJitter = 0;
    let worstQuality: "good" | "fair" | "poor" = "good";
    for (const pid of this.clientPids) {
      const lastPingMs = this.pingArrivalMs.get(pid);
      if (lastPingMs === undefined) {
        worstQuality = "poor";
        continue;
      }
      const silenceMs = nowMs - lastPingMs;
      const jitterMs = this.pingIntervals.get(pid)?.average() ?? 0;
      const quality =
        silenceMs > 6000 ? "poor" : classifyConnectivity(silenceMs, jitterMs);
      if (silenceMs > worstRtt) worstRtt = silenceMs;
      if (jitterMs > worstJitter) worstJitter = jitterMs;
      if (quality === "poor") worstQuality = "poor";
      else if (quality === "fair" && worstQuality === "good")
        worstQuality = "fair";
    }
    return {
      quality: worstQuality,
      rttMs: worstRtt,
      jitterMs: worstJitter,
    };
  }

  private recordPing(pid: number, nowMs: number): void {
    const previousMs = this.pingArrivalMs.get(pid);
    this.pingArrivalMs.set(pid, nowMs);
    let tracker = this.pingIntervals.get(pid);
    if (tracker === undefined) {
      tracker = new JitterTracker();
      this.pingIntervals.set(pid, tracker);
    }
    if (previousMs !== undefined) {
      tracker.addSample(nowMs - previousMs);
    }
  }

  private sendToPid(
    pid: number,
    message: NetworkMessage,
    channel: ChannelKind,
  ): void {
    const peerId = this.deps.peerIdForPid(pid);
    if (peerId === undefined) return;
    this.deps.transport.sendTo(peerId, message, channel);
  }

  private finish(): void {
    this.phaseValue = MATCH_HOST_PHASE.finished;
    debugLog(
      "mp:host",
      () => `match end tick=${this.sim.tick} snapsSent=${this.snapsSent}`,
    );
    const end = this.buildEnd();
    for (const pid of this.clientPids) {
      this.sendToPid(pid, end, "reliable");
    }
    this.deps.onFinished?.(end.scores, end.winners);
  }

  private buildEnd(): EndMessage {
    const snapshot = this.pump.capture();
    const scores = new Map(snapshot.cars.map((car) => [car.pid, car.score]));
    return {
      v: PROTOCOL_VERSION,
      t: "end",
      mid: this.matchId,
      scores: snapshot.cars.map((car): ScoreItem =>
        this.sim.gameMode === "crashfest"
          ? [car.pid, 0, car.score, 0]
          : [car.pid, car.score, 0, car.score],
      ),
      winners:
        this.sim.gameMode === "crashfest"
          ? [...this.sim.winnerPids]
          : resolveWinners(scores),
    };
  }
}
