#!/usr/bin/env node

/**
 * Weekly behavior guard quality audit.
 *
 * Runtime behavior guards are less brittle than source-snippet guards. This
 * audit freezes the current source-only exceptions and forces new weekly
 * behavior guards to either execute bundled code or use a structural parser.
 */

import {
  createCheckGuard as createWeeklyGuard,
  getRepoRoot,
  listGitFiles,
  readRepoFile,
} from '../../lib/shared/guard-utils.mjs';
import { reportBehaviorGuardQuality } from '../../lib/shared/behavior-guard-quality.mjs';
import { WEEKLY_BEHAVIOR_FILE_PATTERN } from '../../lib/weekly/weekly-behavior-gates.mjs';

const GUARD_NAME = 'weekly-behavior-guard-quality';
const BEHAVIOR_FILE_PATTERN = WEEKLY_BEHAVIOR_FILE_PATTERN;
const SOURCE_ONLY_EXCEPTIONS = new Map();

const { reportOk } = createWeeklyGuard(GUARD_NAME);

export function listTrackedWeeklyQualityBehaviorFiles(repoRoot) {
  return listGitFiles([':(glob)scripts/checks/weekly*/**/*.mjs'], {
    cwd: repoRoot,
    filter: (file) => BEHAVIOR_FILE_PATTERN.test(file),
  });
}

export function checkWeeklyBehaviorGuardQuality({ behaviorFiles, readSource }) {
  return reportBehaviorGuardQuality({
    behaviorFiles,
    failureFooter: 'Prefer runtime-backed behavior checks. Keep source-only guards rare, explicit, and limited to render-only TSX shape audits.',
    failureHeader: 'Weekly behavior guard quality drift was detected:',
    guardName: GUARD_NAME,
    readSource,
    reportOk,
    sourceOnlyExceptions: SOURCE_ONLY_EXCEPTIONS,
  });
}

function main() {
  const repoRoot = getRepoRoot();
  const behaviorFiles = listTrackedWeeklyQualityBehaviorFiles(repoRoot);

  checkWeeklyBehaviorGuardQuality({
    behaviorFiles,
    readSource: (behaviorFile) => readRepoFile(repoRoot, behaviorFile),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
