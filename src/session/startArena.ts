import { buildArenaView } from "../game/arena";
import type { ParsedStart } from "../network/protocol/validate";
import type { ArenaView } from "../types/game";

export function arenaFromStart(parsed: ParsedStart): ArenaView {
  const pids = parsed.spawns.map(([pid]) => pid);
  return buildArenaView(
    pids.slice(0, parsed.humanCount),
    pids.slice(parsed.humanCount),
    parsed.gameMode,
  );
}
