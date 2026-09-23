#!/usr/bin/env node

/**
 * Design behavior guard quality audit.
 *
 * Design behavior gates protect token, raw-color, and adapter policy scripts.
 * They should be runtime-backed or parser-backed behavior checks rather than
 * shallow source-snippet scans.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRepoFile,
} from '../../lib/shared/guard-utils.mjs';
import { reportBehaviorGuardQuality } from '../../lib/shared/behavior-guard-quality.mjs';
import {
  DESIGN_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS,
  DESIGN_BEHAVIOR_GUARD_QUALITY_GUARD_NAME,
  DESIGN_BEHAVIOR_GUARD_QUALITY_SOURCE_ONLY_EXCEPTIONS,
  listTrackedDesignBehaviorQualityFiles,
} from '../../lib/design/design-behavior-guard-quality-core.mjs';

export {
  DESIGN_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_GUARD_NAME,
  DESIGN_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS,
  DESIGN_BEHAVIOR_GUARD_QUALITY_GUARD_NAME,
  DESIGN_BEHAVIOR_GUARD_QUALITY_SOURCE_ONLY_EXCEPTIONS,
  hasDesignDirectHelperBehavior,
  hasInjectedDocsDriftFixtureBehavior,
  listTrackedDesignBehaviorQualityFiles,
} from '../../lib/design/design-behavior-guard-quality-core.mjs';

const { reportOk } = createCheckGuard(DESIGN_BEHAVIOR_GUARD_QUALITY_GUARD_NAME, { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  const behaviorFiles = listTrackedDesignBehaviorQualityFiles(repoRoot);

  reportBehaviorGuardQuality({
    behaviorFiles,
    failureFooter: 'Prefer in-memory fixture execution, injected runtime behavior checks, or structural parsers. Design behavior gate registration alone is not enough.',
    failureHeader: 'Design behavior guard quality drift was detected:',
    guardName: DESIGN_BEHAVIOR_GUARD_QUALITY_GUARD_NAME,
    extraRuntimeDetectors: DESIGN_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS,
    readSource: (behaviorFile) => readRepoFile(repoRoot, behaviorFile),
    reportOk,
    sourceOnlyExceptions: DESIGN_BEHAVIOR_GUARD_QUALITY_SOURCE_ONLY_EXCEPTIONS,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
