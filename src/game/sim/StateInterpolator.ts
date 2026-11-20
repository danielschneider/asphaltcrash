import type { MatchSnapshot } from "../../types/game";
import { interpolateSnapshot } from "./interpolate";

// Keeps the sim state before the last fixed step (previous) and after it (current).
// sample(accumulator / STEP) lies between them. Holds copies of sim output only; never mutates sim state.
export class StateInterpolator {
  private previousState: MatchSnapshot;
  private currentState: MatchSnapshot;

  constructor(initial: MatchSnapshot) {
    this.previousState = initial;
    this.currentState = initial;
  }

  get latest(): MatchSnapshot {
    return this.currentState;
  }

  push(snapshot: MatchSnapshot): void {
    this.previousState = this.currentState;
    this.currentState = snapshot;
  }

  // Drops the previous state so the next sample renders the latest state (used while paused).
  collapse(): void {
    this.previousState = this.currentState;
  }

  sample(alpha: number): MatchSnapshot {
    if (alpha <= 0) return this.previousState;
    if (alpha >= 1) return this.currentState;
    return interpolateSnapshot(
      this.previousState,
      this.currentState,
      alpha,
      this.currentState.tick,
    );
  }
}
