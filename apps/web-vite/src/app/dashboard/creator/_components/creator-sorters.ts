import { toNumber, type NumericInput } from './creator-formatters';

export function compareCreatorNumbers(left: NumericInput, right: NumericInput): number {
  return toNumber(left) - toNumber(right);
}

export function compareCreatorNumbersDesc(left: NumericInput, right: NumericInput): number {
  return compareCreatorNumbers(right, left);
}
