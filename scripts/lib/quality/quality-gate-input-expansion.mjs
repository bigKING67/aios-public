import {
  QUALITY_NAMED_INPUTS,
} from './quality-gate-named-inputs.mjs';

export function expandNamedInputPatterns(patterns, namedInputs = QUALITY_NAMED_INPUTS, seen = new Set()) {
  const expanded = [];
  for (const pattern of patterns) {
    if (typeof pattern !== 'string') {
      continue;
    }
    if (!pattern.startsWith('@')) {
      expanded.push(pattern);
      continue;
    }

    const name = pattern.slice(1);
    if (!Object.hasOwn(namedInputs, name)) {
      expanded.push(pattern);
      continue;
    }
    if (seen.has(name)) {
      throw new Error(`quality named input cycle: ${[...seen, name].join(' -> ')}`);
    }
    seen.add(name);
    expanded.push(...expandNamedInputPatterns(namedInputs[name], namedInputs, seen));
    seen.delete(name);
  }

  return [...new Set(expanded)];
}
