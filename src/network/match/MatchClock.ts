const MS_PER_SECOND = 1000;
const SNAP_THRESHOLD_MS = 500;

// Display-only match clock. Counts down at wall rate and is corrected by each host value.
// Drift up to SNAP_THRESHOLD_MS is tolerated; a clock running ahead of the host is pulled back to it,
// and a clock far off in either direction snaps. The display therefore never ticks backwards. Not used by the simulation.
export class MatchClock {
  private clockMs: number | null = null;

  push(hostRemainingMs: number): void {
    if (this.clockMs === null) {
      this.clockMs = hostRemainingMs;
      return;
    }
    const drift = this.clockMs - hostRemainingMs;
    if (drift > 0 || Math.abs(drift) > SNAP_THRESHOLD_MS) {
      this.clockMs = hostRemainingMs;
    }
  }

  advance(dtSeconds: number): number | null {
    if (this.clockMs === null) return null;
    const dt = Math.max(dtSeconds, 0);
    this.clockMs = Math.max(this.clockMs - dt * MS_PER_SECOND, 0);
    return this.clockMs;
  }
}
