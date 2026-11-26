export function errorDetail(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }
  const { type, message } = value as { type?: unknown; message?: unknown };
  if (typeof type === "string" && type.length > 0) {
    return type;
  }
  return typeof message === "string" && message.length > 0
    ? message
    : undefined;
}

export function parseRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
