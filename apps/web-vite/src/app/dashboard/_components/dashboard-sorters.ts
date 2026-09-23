import type { NumericInput } from './dashboard-formatters';

export function toSortableNumber(value: NumericInput): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function compareNullableNumbers(left: NumericInput, right: NumericInput): number {
  const leftNumber = toSortableNumber(left);
  const rightNumber = toSortableNumber(right);

  if (leftNumber === null && rightNumber === null) {
    return 0;
  }
  if (leftNumber === null) {
    return 1;
  }
  if (rightNumber === null) {
    return -1;
  }
  return leftNumber - rightNumber;
}

export function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'zh-CN');
}
