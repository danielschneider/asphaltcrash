import type { ArenaView, MatchSnapshot, WorldView } from "../types/game";

export function buildWorldView(
  snapshot: MatchSnapshot,
  arena: ArenaView,
  localPlayerId: number,
): WorldView {
  return {
    cars: snapshot.cars.map((car) => ({
      pid: car.pid,
      x: car.x,
      y: car.y,
      angle: car.angle,
      hp: car.hp,
      flags: car.flags,
      cargo: car.cargo,
      isLocal: car.pid === localPlayerId,
    })),
    bills: snapshot.bills.map((bill) => ({
      id: bill.id,
      x: bill.x,
      y: bill.y,
      value: bill.value,
    })),
    arena,
  };
}

export function resolveWinners(scores: ReadonlyMap<number, number>): number[] {
  if (scores.size === 0) return [];
  let best = -Infinity;
  for (const score of scores.values()) {
    if (score > best) best = score;
  }
  const winners: number[] = [];
  for (const [pid, score] of scores) {
    if (score === best) winners.push(pid);
  }
  return winners.sort((a, b) => a - b);
}
