import {
  listGitFiles,
} from '../shared/guard-utils.mjs';
import {
  DESIGN_BEHAVIOR_FILE_PATTERN,
} from './design-behavior-gates.mjs';

export const DESIGN_BEHAVIOR_GUARD_QUALITY_GUARD_NAME = 'design-behavior-guard-quality';
export const DESIGN_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_GUARD_NAME = 'design-behavior-guard-quality-behavior';
export const DESIGN_BEHAVIOR_GUARD_QUALITY_SOURCE_ONLY_EXCEPTIONS = new Map();

export function listTrackedDesignBehaviorQualityFiles(repoRoot) {
  return listGitFiles(['scripts/checks/design'], {
    cwd: repoRoot,
    filter: (file) => DESIGN_BEHAVIOR_FILE_PATTERN.test(file),
  });
}

export function hasDesignDirectHelperBehavior(source) {
  return (
    /from\s+['"][./]*lib\/(?:design\/)?raw-color-source-allowlist\.mjs['"]/.test(source) &&
    (
      source.includes('readRawColorSourceAllowlist(') ||
      source.includes('parseRawColorSourceAllowlist(')
    )
  );
}

export function hasInjectedDocsDriftFixtureBehavior(source) {
  return (
    /from\s+['"]\.\/docs-drift\.mjs['"]/.test(source) &&
    source.includes('checkDesignDocsDrift(') &&
    source.includes('const docs = Object.keys(fixtureFiles)')
  );
}

export const DESIGN_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS = Object.freeze([
  hasDesignDirectHelperBehavior,
  hasInjectedDocsDriftFixtureBehavior,
]);
