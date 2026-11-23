import type { HudSnapshot } from "../store/hudStore";
import type { GameMode, MatchSnapshot } from "../types/game";

// Accumulates frame time and reports when a HUD publish is due (gameConfig.hudHz).
export class HudThrottle {
  private readonly intervalSeconds: number;
  private elapsedSeconds = 0;

  constructor(hz: number) {
    this.intervalSeconds = 1 / hz;
  }

  tick(dtSeconds: number): boolean {
    this.elapsedSeconds += Math.max(dtSeconds, 0);
    if (this.elapsedSeconds < this.intervalSeconds) return false;
    this.elapsedSeconds %= this.intervalSeconds;
    return true;
  }

  reset(): void {
    this.elapsedSeconds = 0;
  }
}

export function buildNetworkHud(
  snapshot: MatchSnapshot,
  localPid: number,
  gameMode: GameMode,
  remainingMs: number,
): HudSnapshot {
  const local = snapshot.cars.find((car) => car.pid === localPid);
  return {
    remainingMs: Math.max(remainingMs, 0),
    gameMode,
    winnerPids: null,
    score: local?.score ?? 0,
    cargo: local?.cargo ?? 0,
    hp: local?.hp ?? 0,
    scores: snapshot.cars.map((car) => ({ pid: car.pid, score: car.score })),
    feed: [],
    paused: false,
  };
}
