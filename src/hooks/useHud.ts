import { useSyncExternalStore } from "react";
import { hudStore, type HudSnapshot } from "../store/hudStore";

function subscribeHud(listener: () => void): () => void {
  return hudStore.subscribe(listener);
}

function readHudSnapshot(): HudSnapshot {
  return hudStore.getSnapshot();
}

export function useHud(): HudSnapshot {
  return useSyncExternalStore(subscribeHud, readHudSnapshot);
}
