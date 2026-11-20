import { useHud } from "../../hooks/useHud";
import { resolveWinners } from "../../game/WorldView";
import type { HudScore } from "../../store/hudStore";
import {
  formatCash,
  formatPlayerLabel,
  sortScoresDesc,
} from "../hud/formatters";

interface ResultScreenProps {
  readonly onBack: () => void;
}

interface RankedScore {
  readonly pid: number;
  readonly score: number;
  readonly isWinner: boolean;
}

function buildRanking(scores: readonly HudScore[]): RankedScore[] {
  const scoreMap = new Map<number, number>(
    scores.map((entry) => [entry.pid, entry.score]),
  );
  const winners = new Set(resolveWinners(scoreMap));
  return sortScoresDesc(scores).map((entry) => ({
    pid: entry.pid,
    score: entry.score,
    isWinner: winners.has(entry.pid),
  }));
}

export function ResultScreen({ onBack }: ResultScreenProps) {
  const snapshot = useHud();
  const ranking = buildRanking(snapshot.scores);

  const handleBackToStart = (): void => {
    onBack();
  };

  return (
    <div className="result-screen">
      <h1 className="result-title">Match over</h1>
      <ol className="result-list">
        {ranking.map((entry) => (
          <li
            key={entry.pid}
            className={entry.isWinner ? "result-row is-winner" : "result-row"}
          >
            <span>{formatPlayerLabel(entry.pid)}</span>
            <span>{formatCash(entry.score)}</span>
            {entry.isWinner ? (
              <span className="result-badge">Winner</span>
            ) : null}
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="button button-primary"
        onClick={handleBackToStart}
      >
        Back to start
      </button>
    </div>
  );
}
