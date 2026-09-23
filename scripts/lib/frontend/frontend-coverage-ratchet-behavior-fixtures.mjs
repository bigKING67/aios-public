import {
  buildFrontendCoverageRatchetOptions,
  validateFrontendCoverageRatchetManifest,
} from './frontend-coverage-ratchet-core.mjs';
import {
  checkFrontendCoverageRatchet,
} from '../../checks/frontend/coverage-ratchet.mjs';

const VALID_MANIFEST = Object.freeze({
  version: 1,
  critical: {
    thresholds: {
      statements: 85,
      lines: 85,
      functions: 85,
      branches: 80,
    },
    files: [
      'apps/web-vite/src/lib/request-retry-policy.ts',
      'apps/web-vite/src/lib/request.ts',
    ],
  },
  legacy: [
    {
      id: 'docs-loaders',
      thresholds: {
        statements: 78,
        lines: 77,
        functions: 89,
        branches: 66,
      },
      files: [
        'apps/web-vite/src/app/docs/docs-active-section.ts',
        'apps/web-vite/src/app/docs/docs-workspace-loader.ts',
      ],
    },
  ],
});

export function runFrontendCoverageRatchetBehaviorFixtures(assertions) {
  const {
    assertDeepEqual,
    assertEqual,
    assertIncludes,
  } = assertions;

  const options = buildFrontendCoverageRatchetOptions(VALID_MANIFEST);
  assertDeepEqual(
    options.include,
    [
      'apps/web-vite/src/lib/request-retry-policy.ts',
      'apps/web-vite/src/lib/request.ts',
      'apps/web-vite/src/app/docs/docs-active-section.ts',
      'apps/web-vite/src/app/docs/docs-workspace-loader.ts',
    ],
    'coverage include list should preserve deterministic manifest order',
  );
  assertDeepEqual(
    options.thresholds['apps/web-vite/src/lib/request.ts'],
    VALID_MANIFEST.critical.thresholds,
    'critical coverage threshold should apply per file',
  );
  assertDeepEqual(
    options.thresholds['{apps/web-vite/src/app/docs/docs-active-section.ts,apps/web-vite/src/app/docs/docs-workspace-loader.ts}'],
    VALID_MANIFEST.legacy[0].thresholds,
    'legacy coverage thresholds should apply to the aggregate domain glob',
  );

  let runCount = 0;
  const passing = checkFrontendCoverageRatchet({
    manifest: VALID_MANIFEST,
    runCoverage: () => {
      runCount += 1;
      return { status: 0 };
    },
  });
  assertEqual(passing.status, 0, 'valid manifest and passing Vitest execution should pass');
  assertEqual(runCount, 1, 'valid manifest should execute coverage exactly once');

  const lowCritical = structuredClone(VALID_MANIFEST);
  lowCritical.critical.thresholds.branches = 79.99;
  const lowCriticalFindings = validateFrontendCoverageRatchetManifest(lowCritical);
  assertIncludes(
    lowCriticalFindings.join('\n'),
    'critical.thresholds.branches must stay at or above 80',
    'critical branch threshold regression should fail closed',
  );

  const duplicateFile = structuredClone(VALID_MANIFEST);
  duplicateFile.legacy[0].files[0] = 'apps/web-vite/src/lib/request.ts';
  const invalid = checkFrontendCoverageRatchet({
    manifest: duplicateFile,
    runCoverage: () => {
      runCount += 1;
      return { status: 0 };
    },
  });
  assertEqual(invalid.status, 1, 'duplicate governed file should fail');
  assertIncludes(
    invalid.findings.join('\n'),
    'is governed by more than one coverage ratchet group',
    'duplicate file failure should explain ownership conflict',
  );
  assertEqual(runCount, 1, 'invalid manifest should not execute Vitest');

  const failedRun = checkFrontendCoverageRatchet({
    manifest: VALID_MANIFEST,
    runCoverage: () => ({ status: 7 }),
  });
  assertEqual(failedRun.status, 1, 'Vitest coverage failure should propagate');
  assertIncludes(
    failedRun.findings.join('\n'),
    'status 7',
    'Vitest failure should preserve the exit status',
  );

  return 'manifest validation, per-file critical floors, legacy domain globs, fail-closed execution, and Vitest status propagation passed.';
}
