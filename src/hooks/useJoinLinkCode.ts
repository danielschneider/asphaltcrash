import { useState } from "react";
import { normalizeRoomCode } from "../session/roomCodeRules";

const JOIN_PARAM = "join";

export function readJoinLinkCode(search: string): string {
  return normalizeRoomCode(new URLSearchParams(search).get(JOIN_PARAM) ?? "");
}

// Prefill only: the code is never auto-connected.
export function useJoinLinkCode(): string {
  const [code] = useState<string>(() =>
    readJoinLinkCode(window.location.search),
  );
  return code;
}
