import { getMatchTestHook, type MatchSimulation } from "./MatchSimulation";

// Test-only. Teleports a car through the internal hook registered by MatchSimulation (not part of its public API).
export function placeCarForTest(
  sim: MatchSimulation,
  pid: number,
  x: number,
  y: number,
  angle: number,
): void {
  const hook = getMatchTestHook(sim);
  if (hook === undefined) {
    throw new Error("placeCarForTest: simulation has no test hook");
  }
  hook.placeCar(pid, x, y, angle);
}
