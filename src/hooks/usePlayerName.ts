import { useCallback, useState } from "react";
import { generatePlayerName } from "../session/playerNames";

export interface PlayerNameState {
  readonly name: string;
  readonly setName: (next: string) => void;
  readonly refresh: () => void;
}

export function usePlayerName(): PlayerNameState {
  const [name, setNameValue] = useState<string>(() => generatePlayerName());

  const setName = useCallback((next: string): void => {
    setNameValue(next);
  }, []);

  const refresh = useCallback((): void => {
    setNameValue(generatePlayerName());
  }, []);

  return { name, setName, refresh };
}
