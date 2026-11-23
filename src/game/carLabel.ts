export function truncateCarName(name: string, maxChars: number): string {
  return Array.from(name).slice(0, maxChars).join("");
}
