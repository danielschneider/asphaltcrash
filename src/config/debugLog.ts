export type DebugMessage = string | (() => string);

export type DebugLogFn = (tag: string, message: DebugMessage) => void;

export function createDebugLog(
  enabled: boolean,
  write: (line: string) => void = (line) => console.log(line),
): DebugLogFn {
  return (tag, message) => {
    if (!enabled) return;
    const text = typeof message === "string" ? message : message();
    write(`[${tag}] ${text}`);
  };
}

const IS_DEBUG_ENABLED =
  (import.meta as ImportMeta & { readonly env?: { readonly DEV?: boolean } })
    .env?.DEV === true;

// Pass a thunk for hot-path messages so the string is only built when logging is enabled.
export const debugLog: DebugLogFn = createDebugLog(IS_DEBUG_ENABLED);
