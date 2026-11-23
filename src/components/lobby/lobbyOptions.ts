import type { ChoiceOption } from "./ChoiceGroup";
import type { BotDifficulty, GameMode } from "../../types/game";

export const gameModeOptions: readonly ChoiceOption<GameMode>[] = [
  {
    value: "cash",
    label: "Cash run",
    description: "Grab bills, deliver to base. Highest cash wins.",
  },
  {
    value: "crashfest",
    label: "Crashfest",
    description: "No timer or bases. Last car standing wins.",
  },
];

export const difficultyOptions: readonly ChoiceOption<BotDifficulty>[] = [
  { value: "easy", label: "Easy" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Hard" },
];
