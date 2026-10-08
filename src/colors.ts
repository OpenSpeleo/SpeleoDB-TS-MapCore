/** Model colors are six-digit CSS hex values; there is no client color palette. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
export function safeHexColor(value: unknown, fallback: string): string {
  return isHexColor(value) ? value : fallback;
}
