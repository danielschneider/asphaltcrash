import { useHud } from "../../hooks/useHud";
import { resolveWinners } from "../../game/WorldView";
import type { HudScore } from "../../store/hudStore";
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
}

function buildRanking(
  scores: readonly HudScore[],
  winnerPids: readonly number[] | null,
): RankedScore[] {
  const scoreMap = new Map<number, number>(
    scores.map((entry) => [entry.pid, entry.score]),
  );
  const winners = new Set(winnerPids ?? resolveWinners(scoreMap));
  return sortScoresDesc(scores).map((entry) => ({
    pid: entry.pid,
    score: entry.score,
    isWinner: winners.has(entry.pid),
  }));
}

export function ResultScreen({ onBack, onReturnToLobby }: ResultScreenProps) {
  const snapshot = useHud();
  const ranking = buildRanking(snapshot.scores, snapshot.winnerPids);

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
                className={
                  entry.isWinner ? "result-row is-winner" : "result-row"
                }
              >
                <span>{formatPlayerLabel(entry.pid)}</span>
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
              <>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleBackToLobby}
                >
                  Back to lobby
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={handleBackToStart}
                >
                  Leave room
                </button>
              </>
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
