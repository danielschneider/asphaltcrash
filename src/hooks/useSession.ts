import { useSyncExternalStore } from "react";
import {
  sessionController,
  type SessionState,
} from "../session/SessionController";

function subscribeSession(listener: () => void): () => void {
  return sessionController.subscribe(listener);
}

function readSessionState(): SessionState {
  return sessionController.getState();
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, readSessionState);
}
