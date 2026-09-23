import {
  sortAffectedReasons,
} from './quality-affected-selection-utils.mjs';

export function explainAffectedSelection(selection) {
  const lines = [];
  const entries = Object.entries(selection.reasons ?? {})
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [name, reasons] of entries) {
    lines.push(`${name}`);
    for (const reason of sortAffectedReasons(reasons)) {
      lines.push(`  - ${reason}`);
    }
  }
  return lines.join('\n');
}
