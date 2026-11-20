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
import { frameSecondsSince } from "./frameSeconds";

export interface MatchClientDeps {
  readonly transport: Transport;
  readonly hostPeerId: PeerId;
  readonly localPid: number;
  readonly renderer: WorldRenderer;
  readonly inputBuffer: InputBuffer;
  readonly now: () => number;
  readonly requestFrame: (cb: (t: number) => void) => number;
  readonly cancelFrame: (id: number) => void;
  readonly onEnd?: (msg: EndMessage) => void;
}

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
  private snapsReceived = 0;
  private rendererUpdates = 0;

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

  // initialStart: a start already consumed by the lobby listener; handled here so ready is sent.
  start(initialStart?: NetworkMessage): void {
    if (this.unsubscribe !== null) return;
    this.unsubscribe = this.deps.transport.onMessage((msg, from) => {
      this.handleInbound(msg, from);
    });
    if (initialStart !== undefined) this.handleStart(initialStart);
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
    this.renderFrame(dtSeconds);
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
    console.log(`[mp][client] start received ok=${parsed.ok}`);
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
    console.log(`[mp][client] ready sent cars=${pids.length}`);
  }

  private handleSnap(raw: NetworkMessage): void {
    if (this.arena === null) {
      console.log("[mp][client] snap dropped: arena null (start not handled)");
      return;
    }
    const parsed = validateSnapPayload(raw);
    if (!parsed.ok) {
      console.log(`[mp][client] snap invalid reason=${parsed.reason}`);
      return;
    }
    this.remote.push(fromSnapMessage(parsed.value));
    this.snapsReceived += 1;
    if (this.snapsReceived === 1 || this.snapsReceived % 60 === 0) {
      console.log(
        `[mp][client] snap n=${this.snapsReceived} tick=${parsed.value.tm} cars=${parsed.value.cars.length}`,
      );
    }
  }

  private handleEnd(msg: EndMessage): void {
    if (msg.mid !== this.matchId) return;
    this.scores = msg.scores;
    this.finished = true;
    this.deps.onEnd?.(msg);
  }

  private pumpInput(nowMs: number): void {
    const input = this.deps.inputBuffer.latest();
    if (input.seq !== this.lastInputSeq) {
      this.lastInputSeq = input.seq;
      this.inputSender.setLatest(input.throttle, input.steer, input.action);
    }
    this.inputSender.tick(nowMs);
  }

  private renderFrame(dtSeconds: number): void {
    const arena = this.arena;
    if (arena === null) return;
    const sample = this.remote.advance(dtSeconds);
    if (sample === null) return;
    this.deps.renderer.update(
      buildWorldView(sample, arena, this.deps.localPid),
      dtSeconds,
    );
    this.rendererUpdates += 1;
    if (this.rendererUpdates === 1 || this.rendererUpdates % 60 === 0) {
      console.log(
        `[mp][client] renderer.update n=${this.rendererUpdates} cars=${sample.cars.length}`,
      );
    }
  }

  private takeFrameSeconds(nowMs: number): number {
    const seconds = frameSecondsSince(this.lastFrameMs, nowMs);
    this.lastFrameMs = nowMs;
    return seconds;
  }
}
