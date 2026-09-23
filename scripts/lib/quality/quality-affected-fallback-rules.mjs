import {
  SAFE_FALLBACK_GATES,
} from './quality-affected-gates.mjs';

export function noChangedFilesFallbackRule(changedFiles) {
  if (changedFiles.length !== 0) {
    return null;
  }

  return {
    gates: SAFE_FALLBACK_GATES,
    reason: 'no changed files detected; running safe fallback',
  };
}

export function unknownPathFallbackRule(file) {
  return {
    gates: SAFE_FALLBACK_GATES,
    reason: `${file}: unknown path safe fallback`,
  };
}
