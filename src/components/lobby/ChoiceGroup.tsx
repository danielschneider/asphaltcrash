import { useId, type KeyboardEvent, type ReactNode } from "react";

export interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
}

interface ChoiceGroupProps<T extends string> {
  readonly label: string;
  readonly options: readonly ChoiceOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly variant: "segmented" | "cards";
  readonly disabled?: boolean;
  readonly footnote?: ReactNode;
}

export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  variant,
  disabled = false,
  footnote,
}: ChoiceGroupProps<T>) {
  const labelId = useId();

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    const step = keyStep(event.key);
    if (step === 0) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + step + options.length) % options.length];
    if (next !== undefined) onChange(next.value);
  };

  return (
    <div className="choice-field">
      <span id={labelId} className="choice-label">
        {label}
      </span>
      <div
        className={`choice-group choice-group-${variant}`}
        role="radiogroup"
        aria-labelledby={labelId}
      >
        {options.map((option) => {
          const isChecked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isChecked}
              tabIndex={isChecked ? 0 : -1}
              disabled={disabled}
              className={isChecked ? "choice is-selected" : "choice"}
              onClick={() => onChange(option.value)}
              onKeyDown={handleKeyDown}
            >
              <span className="choice-name">{option.label}</span>
              {option.description !== undefined ? (
                <span className="choice-description">{option.description}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {footnote}
    </div>
  );
}

function keyStep(key: string): number {
  if (key === "ArrowLeft" || key === "ArrowUp") return -1;
  if (key === "ArrowRight" || key === "ArrowDown") return 1;
  return 0;
}
