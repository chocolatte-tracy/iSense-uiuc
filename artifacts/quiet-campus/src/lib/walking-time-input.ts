/** Blank or invalid edits must not replace the last valid route constraint. */
export function parseWalkingMinutes(input: string): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const value = Number(input);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
