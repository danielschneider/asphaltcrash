import { useSyncExternalStore } from "react";
import { lobbyStore, type LobbySnapshot } from "../store/lobbyStore";

export function useLobby(): LobbySnapshot {
  return useSyncExternalStore(lobbyStore.subscribe, lobbyStore.getSnapshot);
}
