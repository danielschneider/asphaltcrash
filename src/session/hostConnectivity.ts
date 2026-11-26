import type {
  ConnectivityQuality,
  ConnectivitySnapshot,
} from "../store/hudStore";
import { classifyConnectivity, JitterTracker } from "../network/sync/PingPong";

const SILENCE_POOR_MS = 6000;

export class HostConnectivity {
  private readonly arrivalMs = new Map<number, number>();
  private readonly intervals = new Map<number, JitterTracker>();

  recordPing(pid: number, nowMs: number): void {
    const previousMs = this.arrivalMs.get(pid);
    this.arrivalMs.set(pid, nowMs);
    let tracker = this.intervals.get(pid);
    if (tracker === undefined) {
      tracker = new JitterTracker();
      this.intervals.set(pid, tracker);
    }
    if (previousMs !== undefined) {
      tracker.addSample(nowMs - previousMs);
    }
  }

  snapshot(
    pids: readonly number[],
    nowMs: number,
  ): ConnectivitySnapshot | null {
    if (pids.length === 0) return null;
    let worstRtt = 0;
    let worstJitter = 0;
    let worstQuality: ConnectivityQuality = "good";
    for (const pid of pids) {
      const lastPingMs = this.arrivalMs.get(pid);
      if (lastPingMs === undefined) {
        worstQuality = "poor";
        continue;
      }
      const silenceMs = nowMs - lastPingMs;
      const jitterMs = this.intervals.get(pid)?.average() ?? 0;
      const quality =
        silenceMs > SILENCE_POOR_MS
          ? "poor"
          : classifyConnectivity(silenceMs, jitterMs);
      if (silenceMs > worstRtt) worstRtt = silenceMs;
      if (jitterMs > worstJitter) worstJitter = jitterMs;
      if (quality === "poor") worstQuality = "poor";
      else if (quality === "fair" && worstQuality === "good")
        worstQuality = "fair";
    }
    return { quality: worstQuality, rttMs: worstRtt, jitterMs: worstJitter };
  }
}
