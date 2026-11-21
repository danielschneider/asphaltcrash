import { useId, type KeyboardEvent } from "react";

export const START_MODES = {
  solo: "solo",
  multiplayer: "multiplayer",
} as const;

export type StartMode = (typeof START_MODES)[keyof typeof START_MODES];

interface ModeSwitchProps {
  readonly mode: StartMode;
  readonly onChange: (mode: StartMode) => void;
}

const MODE_OPTIONS: readonly {
  readonly mode: StartMode;
  readonly label: string;
}[] = [
  { mode: START_MODES.solo, label: "Single player" },
  { mode: START_MODES.multiplayer, label: "Multiplayer" },
];

export function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  const groupLabelId = useId();

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const next =
      mode === START_MODES.solo ? START_MODES.multiplayer : START_MODES.solo;
    onChange(next);
  };

  return (
    <div
      className="mode-switch"
      role="radiogroup"
      aria-labelledby={groupLabelId}
    >
      <span id={groupLabelId} className="visually-hidden">
        Play type
      </span>
      {MODE_OPTIONS.map((option) => {
        const isChecked = option.mode === mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={isChecked}
            tabIndex={isChecked ? 0 : -1}
            className={isChecked ? "button button-primary" : "button"}
            onClick={() => onChange(option.mode)}
            onKeyDown={handleKeyDown}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
