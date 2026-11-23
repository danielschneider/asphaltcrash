import { useHud } from "../../hooks/useHud";
import { resolveWinners } from "../../game/WorldView";
import type { HudSnapshot } from "../../store/hudStore";
import { Brand } from "../brand/Brand";
import {
  formatCash,
  formatPlayerLabel,
  sortScoresDesc,
} from "../hud/formatters";

interface ResultScreenProps {
  readonly onBack: () => void;
  readonly onReturnToLobby: (() => void) | undefined;
}

interface RankedScore {
  readonly pid: number;
  readonly score: number;
  readonly isWinner: boolean;
  readonly isSelf: boolean;
  readonly label: string;
}

function buildRanking(snapshot: HudSnapshot): RankedScore[] {
  const scoreMap = new Map<number, number>(
    snapshot.scores.map((entry) => [entry.pid, entry.score]),
  );
  const winners = new Set(snapshot.winnerPids ?? resolveWinners(scoreMap));
  const names = snapshot.names ?? new Map<number, string>();
  return sortScoresDesc(snapshot.scores).map((entry) => ({
    pid: entry.pid,
    score: entry.score,
    isWinner: winners.has(entry.pid),
    isSelf: entry.pid === snapshot.localPid,
    label: names.get(entry.pid) ?? formatPlayerLabel(entry.pid),
  }));
}

export function ResultScreen({ onBack, onReturnToLobby }: ResultScreenProps) {
  const snapshot = useHud();
  const ranking = buildRanking(snapshot);

  const handleBackToStart = (): void => {
    onBack();
  };

  const handleBackToLobby = (): void => {
    onReturnToLobby?.();
  };

  return (
    <div className="menu-screen">
      <div className="menu-inner">
        <Brand />
        <div className="menu-card">
          <h2 className="result-title">Match over</h2>
          <ol className="result-list">
            {ranking.map((entry) => (
              <li
                key={entry.pid}
                className={`result-row${entry.isWinner ? " is-winner" : ""}${entry.isSelf ? " is-self" : ""}`}
              >
                <span>{entry.label}</span>
                <span>
                  {snapshot.gameMode === "crashfest"
                    ? `${entry.score} kills`
                    : formatCash(entry.score)}
                </span>
                {entry.isWinner ? (
                  <span className="result-badge">Winner</span>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="result-actions">
            {onReturnToLobby ? (
              <button
                type="button"
                className="button button-primary"
                onClick={handleBackToLobby}
              >
                Back to lobby
              </button>
            ) : (
              <button
                type="button"
                className="button button-primary"
                onClick={handleBackToStart}
              >
                Back to start
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
