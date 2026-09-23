#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { renderVerifyCiSh } from '../../ci/render-verify-ci-sh.mjs';
import {
  checkGeneratedVerifyCiWrapper,
  formatGeneratedVerifyCiWrapperFailure,
} from './generated-wrapper.mjs';

const { assertEqual, assertIncludes, assertNotIncludes, reportOk } = createCheckGuard(
  'verify-ci-generated-behavior',
);

const EXPECTED_VERIFY_CI = renderVerifyCiSh();
const PASS_OUTPUT = '[verify-ci-generated] OK: scripts/verify-ci.sh is a thin quality-runner wrapper.\n';

function runGeneratedGuard(verifyCiSource) {
  const { isCurrent } = checkGeneratedVerifyCiWrapper(verifyCiSource, {
    expected: EXPECTED_VERIFY_CI,
  });

  if (isCurrent) {
    return {
      status: 0,
      stdout: PASS_OUTPUT,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatGeneratedVerifyCiWrapperFailure()}\n`,
  };
}

function withFixture(verifyCiSource, assertion) {
  assertion(runGeneratedGuard(verifyCiSource));
}

withFixture(EXPECTED_VERIFY_CI, (result) => {
  assertEqual(result.status, 0, 'quality-runner verify-ci wrapper should pass');
  assertIncludes(
    result.stdout,
    'scripts/verify-ci.sh is a thin quality-runner wrapper',
    'passing output should confirm wrapper sync',
  );
});

withFixture(EXPECTED_VERIFY_CI.replace('quality-runner.mjs" run ci', 'quality-runner.mjs" run quick'), (result) => {
  assertEqual(result.status, 1, 'manual runner mode drift should fail');
  assertIncludes(
    result.stderr,
    'scripts/verify-ci.sh wrapper drift was detected',
    'drift output should identify wrapper sync failure',
  );
});

withFixture(EXPECTED_VERIFY_CI.replace('\nset -euo pipefail\n', '\n'), (result) => {
  assertEqual(result.status, 1, 'manual safety option drift should fail');
  assertIncludes(
    result.stderr,
    'Regenerate with: node scripts/ci/render-verify-ci-sh.mjs > scripts/verify-ci.sh',
    'drift output should provide regeneration command',
  );
  assertNotIncludes(result.stdout, '[verify-ci-generated] OK', 'drift should not report OK');
});

reportOk('matching wrapper, runner mode drift, and safety option drift checks passed.');
