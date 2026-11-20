import { useSyncExternalStore } from "react";

const PORTRAIT_QUERY = "(orientation: portrait)";

function getPortraitQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return null;
  return window.matchMedia(PORTRAIT_QUERY);
}

function subscribeOrientation(listener: () => void): () => void {
  const query = getPortraitQuery();
  if (!query) return () => undefined;
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function readIsPortrait(): boolean {
  return getPortraitQuery()?.matches ?? false;
}

export function useOrientationPause(): boolean {
  return useSyncExternalStore(subscribeOrientation, readIsPortrait);
}
