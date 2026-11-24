import { useState } from "react";
import { gameConfig } from "../../config/gameConfig";
import { useHud } from "../../hooks/useHud";
import type { HudScore } from "../../store/hudStore";
import { formatCash, formatPlayerLabel, sortScoresDesc } from "./formatters";
import { TimerBadge } from "./TimerBadge";
import { ConnectivitySignal } from "./ConnectivitySignal";

const FEED_VISIBLE_COUNT = 3;

interface ScoreboardProps {
  readonly entries: readonly HudScore[];
}

function Scoreboard({ entries }: ScoreboardProps) {
  return (
    <ol className="hud-scoreboard">
      {sortScoresDesc(entries).map((entry) => (
        <li key={entry.pid}>
          {formatPlayerLabel(entry.pid)}: {formatCash(entry.score)}
        </li>
      ))}
    </ol>
  );
}

export function Hud() {
  const snapshot = useHud();
  const [isScoreboardOpen, setIsScoreboardOpen] = useState(false);
  const feed = snapshot.feed.slice(-FEED_VISIBLE_COUNT);

  const handleToggleScoreboard = (): void => {
    setIsScoreboardOpen((previous) => !previous);
  };

  return (
    <div className="hud">
      <TimerBadge
        remainingMs={snapshot.remainingMs}
        gameMode={snapshot.gameMode}
      />
      {snapshot.connectivity ? (
        <ConnectivitySignal connectivity={snapshot.connectivity} />
      ) : null}
      <div className="hud-panel">
        {snapshot.gameMode === "crashfest" ? (
          <span>Kills {snapshot.score}</span>
        ) : (
          <>
            <span>Cash {formatCash(snapshot.score)}</span>
            <span>
              Cargo {snapshot.cargo}/{gameConfig.cargoCapacity}
            </span>
          </>
        )}
        <span>
          HP {snapshot.hp}/{gameConfig.maxHealth}
        </span>
      </div>
      {snapshot.paused ? <div className="hud-paused">Paused</div> : null}
      <button
        type="button"
        className="hud-toggle"
        aria-expanded={isScoreboardOpen}
        onClick={handleToggleScoreboard}
      >
        Scores
      </button>
      {isScoreboardOpen ? <Scoreboard entries={snapshot.scores} /> : null}
      <ul className="hud-feed">
        {feed.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
