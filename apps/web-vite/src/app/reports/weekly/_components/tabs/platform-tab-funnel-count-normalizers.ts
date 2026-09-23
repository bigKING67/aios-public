import {
  toOptionalNumber,
  toSafeNumber,
} from './platform-tab-formatters';

export function normalizeOptionalFunnelCount(value: unknown): number | undefined {
  const numericValue = toOptionalNumber(value);
  if (numericValue === undefined) {
    return undefined;
  }

  return Math.max(0, Math.round(numericValue));
}

export function normalizeFunnelCount(value: unknown): number {
  return Math.max(0, Math.round(toSafeNumber(value)));
}
