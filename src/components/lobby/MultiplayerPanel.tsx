import { useId, useState, type ChangeEvent } from "react";
import { useLobby } from "../../hooks/useLobby";
import { usePlayerName } from "../../hooks/usePlayerName";
import {
  normalizeRoomCode,
  validateRoomCode,
} from "../../session/roomCodeRules";
import { sessionController } from "../../session/SessionController";
import {
  PLAYER_NAME_MAX_LENGTH,
  generatePlayerName,
} from "../../session/playerNames";

interface MultiplayerPanelProps {
  readonly initialJoinCode: string;
}

const MAX_CODE_LENGTH = 6;

export function MultiplayerPanel({ initialJoinCode }: MultiplayerPanelProps) {
  const [code, setCode] = useState<string>(initialJoinCode);
  const { name, setName, refresh } = usePlayerName();
  const { error } = useLobby();
  const nameId = useId();
  const codeId = useId();
  const isCodeValid = validateRoomCode(code);

  const resolveName = (): string => name.trim() || generatePlayerName();

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setName(event.target.value);
  };

  const handleRefreshName = (): void => {
    refresh();
  };

  const handleCodeChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setCode(normalizeRoomCode(event.target.value));
  };

  const handleHost = (): void => {
    sessionController.createRoom(resolveName());
  };

  const handleJoin = (): void => {
    if (!isCodeValid) return;
    sessionController.joinRoom(code, resolveName());
  };

  return (
    <div className="start-form multiplayer-panel">
      <div className="start-field">
        <label htmlFor={nameId}>Name</label>
        <div className="name-row">
          <input
            id={nameId}
            type="text"
            maxLength={PLAYER_NAME_MAX_LENGTH}
            placeholder="Generated if empty"
            value={name}
            onChange={handleNameChange}
          />
          <button
            type="button"
            className="button button-icon"
            aria-label="Generate new name"
            onClick={handleRefreshName}
          >
            ↻
          </button>
        </div>
      </div>
      <button
        type="button"
        className="button button-primary"
        onClick={handleHost}
      >
        Host room
      </button>
      <div className="start-field">
        <label htmlFor={codeId}>Room code</label>
        <input
          id={codeId}
          type="text"
          maxLength={MAX_CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={handleCodeChange}
        />
      </div>
      <button
        type="button"
        className="button"
        disabled={!isCodeValid}
        onClick={handleJoin}
      >
        Join
      </button>
      {error !== null ? (
        <p role="alert" className="lobby-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
