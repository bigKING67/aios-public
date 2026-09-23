export function toOptionalNumber(value: unknown): number | undefined {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return undefined;
  }
  return numericValue;
}

export function toSafeNumber(value: unknown): number {
  return toOptionalNumber(value) ?? 0;
}
