import type { WorldRenderer } from "../game/Renderer";
import type { InputBuffer } from "../game/input/InputBuffer";
import { buildArenaView } from "../game/arena";
import { buildWorldView } from "../game/WorldView";
import { InputSender } from "../network/match/InputSender";
import { RemoteView } from "../network/match/RemoteView";
import { makeReady, parseStart } from "../network/match/startMessage";
import { fromSnapMessage, toInputMessage } from "../network/protocol/codec";
import type {
  EndMessage,
  NetworkMessage,
  ScoreItem,
} from "../network/protocol/messages";
import { validateSnapPayload } from "../network/protocol/validate";
import type { Transport, Unsubscribe } from "../network/transport/Transport";
import type { ArenaView } from "../types/game";
import type { PeerId } from "../types/network";

export interface MatchClientDeps {
  readonly transport: Transport;
  readonly hostPeerId: PeerId;
  readonly localPid: number;
  readonly renderer: WorldRenderer;
  readonly inputBuffer: InputBuffer;
  readonly now: () => number;
  readonly requestFrame: (cb: (t: number) => void) => number;
  readonly cancelFrame: (id: number) => void;
}

const MAX_FRAME_SECONDS = 0.1;
const MS_PER_SECOND = 1000;
const UNSEEDED = -1;

export class MatchClient {
  private readonly deps: MatchClientDeps;
  private readonly remote = new RemoteView();
  private readonly inputSender: InputSender;
  private matchId: number | null = null;
  private arena: ArenaView | null = null;
  private scores: readonly ScoreItem[] = [];
  private finished = false;
  private unsubscribe: Unsubscribe | null = null;
  private frameId: number | null = null;
  private lastFrameMs: number | null = null;
  private lastInputSeq = UNSEEDED;

  constructor(deps: MatchClientDeps) {
    this.deps = deps;
    this.inputSender = new InputSender((frame) => {
      deps.transport.send(toInputMessage(frame), "unreliable");
    });
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get finalScores(): readonly ScoreItem[] {
    return this.scores;
  }

  start(): void {
    if (this.unsubscribe !== null) return;
    this.unsubscribe = this.deps.transport.onMessage((msg, from) => {
      this.handleInbound(msg, from);
    });
    this.frameId = this.deps.requestFrame(this.handleFrame);
  }

  stop(): void {
    if (this.frameId !== null) {
      this.deps.cancelFrame(this.frameId);
      this.frameId = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.lastFrameMs = null;
  }

  private readonly handleFrame = (): void => {
    this.frameId = null;
    if (this.finished) return;
    const nowMs = this.deps.now();
    const dtSeconds = this.takeFrameSeconds(nowMs);
    this.pumpInput(nowMs);
    this.renderFrame(nowMs, dtSeconds);
    this.frameId = this.deps.requestFrame(this.handleFrame);
  };

  private handleInbound(msg: NetworkMessage, from: PeerId): void {
    if (from !== this.deps.hostPeerId) return;
    switch (msg.t) {
      case "start":
        this.handleStart(msg);
        return;
      case "snap":
        this.handleSnap(msg);
        return;
      case "end":
        this.handleEnd(msg);
        return;
      default:
        return;
    }
  }

  private handleStart(raw: NetworkMessage): void {
    const parsed = parseStart(raw);
    if (!parsed.ok) return;
    const { mid, spawns, cfg } = parsed.value;
    const pids = spawns.map(([pid]) => pid);
    const humanCount = typeof cfg.humanCount === "number" ? cfg.humanCount : 0;
    this.matchId = mid;
    this.arena = buildArenaView(
      pids.slice(0, humanCount),
      pids.slice(humanCount),
    );
    this.deps.transport.send(makeReady(mid), "reliable");
  }

  private handleSnap(raw: NetworkMessage): void {
    if (this.arena === null) return;
    const parsed = validateSnapPayload(raw);
    if (!parsed.ok) return;
    this.remote.push(fromSnapMessage(parsed.value));
  }

  private handleEnd(msg: EndMessage): void {
    if (msg.mid !== this.matchId) return;
    this.scores = msg.scores;
    this.finished = true;
  }

  private pumpInput(nowMs: number): void {
    const input = this.deps.inputBuffer.latest();
    if (input.seq !== this.lastInputSeq) {
      this.lastInputSeq = input.seq;
      this.inputSender.setLatest(input.throttle, input.steer, input.action);
    }
    this.inputSender.tick(nowMs);
  }

  private renderFrame(nowMs: number, dtSeconds: number): void {
    const arena = this.arena;
    if (arena === null) return;
    const sample = this.remote.sampleAt(nowMs);
    if (sample === null) return;
    this.deps.renderer.update(
      buildWorldView(sample, arena, this.deps.localPid),
      dtSeconds,
    );
  }

  private takeFrameSeconds(nowMs: number): number {
    const last = this.lastFrameMs;
    this.lastFrameMs = nowMs;
    if (last === null) return 0;
    const seconds = (nowMs - last) / MS_PER_SECOND;
    return Math.min(Math.max(seconds, 0), MAX_FRAME_SECONDS);
  }
}
