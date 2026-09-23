import {
  QUICK_BASELINE_GATES,
  PREPUSH_BASELINE_GATES,
} from './quality-affected-gates.mjs';

export {
  defaultAffectedBase,
  changedFilesEnvValue,
  isIgnoredAffectedFile,
  listChangedFileEntries,
  listChangedFiles,
  packageJsonChangeRequiresFullCi,
  packageJsonChangeRequiresFullCiWithReader,
  packageJsonChangeKind,
  packageLockChangeRequiresFullCi,
  packageLockChangeRequiresFullCiWithReader,
  packageLockChangeKind,
} from './quality-affected-files.mjs';
export {
  selectAffectedGates,
} from './quality-affected-selection.mjs';
export {
  explainAffectedSelection,
} from './quality-affected-explain.mjs';

export function baselineGateNamesForMode(mode) {
  if (mode === 'quick') {
    return [...QUICK_BASELINE_GATES];
  }
  if (mode === 'prepush') {
    return [...PREPUSH_BASELINE_GATES];
  }
  return [];
}
