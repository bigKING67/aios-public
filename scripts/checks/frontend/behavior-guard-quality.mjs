#!/usr/bin/env node

/**
 * Non-weekly frontend behavior guard quality audit.
 *
 * Registries keep behavior gates wired into verify:ci; this gate checks that
 * the behavior guards themselves execute real fixtures or use structural
 * parsing instead of brittle source-snippet scans.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRepoFile,
} from '../../lib/shared/guard-utils.mjs';
import { reportBehaviorGuardQuality } from '../../lib/shared/behavior-guard-quality.mjs';
import {
  FRONTEND_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS,
  FRONTEND_BEHAVIOR_GUARD_QUALITY_GUARD_NAME,
  FRONTEND_BEHAVIOR_GUARD_QUALITY_SOURCE_ONLY_EXCEPTIONS,
  listTrackedFrontendBehaviorQualityFiles,
} from '../../lib/frontend/frontend-behavior-guard-quality-core.mjs';

export {
  FRONTEND_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_GUARD_NAME,
  FRONTEND_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS,
  FRONTEND_BEHAVIOR_GUARD_QUALITY_GUARD_NAME,
  FRONTEND_BEHAVIOR_GUARD_QUALITY_SOURCE_ONLY_EXCEPTIONS,
  hasFrontendDirectHelperBehavior,
  hasSharedBehaviorRunner,
  listTrackedFrontendBehaviorQualityFiles,
} from '../../lib/frontend/frontend-behavior-guard-quality-core.mjs';

const { reportOk } = createCheckGuard(FRONTEND_BEHAVIOR_GUARD_QUALITY_GUARD_NAME, { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  const behaviorFiles = listTrackedFrontendBehaviorQualityFiles(repoRoot);

  reportBehaviorGuardQuality({
    behaviorFiles,
    extraRuntimeDetectors: FRONTEND_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS,
    failureFooter: 'Prefer temp-repo runtime behavior checks or structural parsers. Registry presence alone is not enough.',
    failureHeader: 'Frontend behavior guard quality drift was detected:',
    guardName: FRONTEND_BEHAVIOR_GUARD_QUALITY_GUARD_NAME,
    readSource: (behaviorFile) => readRepoFile(repoRoot, behaviorFile),
    reportOk,
    sourceOnlyExceptions: FRONTEND_BEHAVIOR_GUARD_QUALITY_SOURCE_ONLY_EXCEPTIONS,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
