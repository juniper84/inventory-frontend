/**
 * Looks up a DB enum value in a translated label map.
 * Falls back to the raw value if the key is not found.
 */
export function formatEnum(
  map: Record<string, string>,
  value: string | null | undefined,
): string {
  if (value == null) return '';
  return map[value] ?? value;
}
