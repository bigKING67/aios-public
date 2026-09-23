#!/usr/bin/env node

import path from 'node:path';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { runShellSyntaxCheck } from '../../lib/ci/shell-syntax-core.mjs';
import {
  createSchedulerTempWorkspace,
  removeSchedulerTempWorkspace,
  writeText,
} from './scheduler-fixtures.mjs';

const {
  assertEqual,
  assertFalse,
  assertIncludes,
  assertNotIncludes,
  reportOk,
} = createCheckGuard('quality-runner-scheduler-shell-behavior');

export function runQualityRunnerSchedulerShellBehaviorCheck() {
  const repoRoot = createSchedulerTempWorkspace();
  try {
    writeText(path.join(repoRoot, 'scripts/changed-ok.sh'), '#!/usr/bin/env bash\ntrue\n');
    writeText(path.join(repoRoot, 'scripts/unchanged-broken.sh'), '#!/usr/bin/env bash\nif then\n');
    writeText(path.join(repoRoot, 'etl/groland_postgres/scripts/changed-etl.sh'), '#!/usr/bin/env bash\ntrue\n');
    writeText(path.join(repoRoot, '.githooks/pre-push'), '#!/usr/bin/env bash\ntrue\n');

    const changedResult = runShellSyntaxCheck({
      repoRoot,
      env: {
        ...process.env,
        AIOS_SHELL_SYNTAX_CHANGED_FILES: [
          'M:scripts/changed-ok.sh',
          'M:etl/groland_postgres/scripts/changed-etl.sh',
          'M:.githooks/pre-push',
        ].join('\n'),
        AIOS_SHELL_SYNTAX_CHANGED_SCOPE: 'changed',
        FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES: 'M:scripts/unchanged-broken.sh',
      },
    });
    assertEqual(changedResult.status, 0, `changed shell syntax path should ignore unrelated broken shell files\nstdout:\n${changedResult.stdout}\nstderr:\n${changedResult.stderr}`);
    assertIncludes(changedResult.stdout, 'mode=changed', 'changed shell syntax path should report changed mode');
    assertIncludes(changedResult.stdout, 'checked=3', 'changed shell syntax path should only check changed shell/hook files');

    const noShellChangedResult = runShellSyntaxCheck({
      repoRoot,
      env: {
        ...process.env,
        AIOS_SHELL_SYNTAX_CHANGED_FILES: '',
        AIOS_SHELL_SYNTAX_CHANGED_SCOPE: 'changed',
        FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES: 'M:apps/web-vite/src/app/page.tsx',
      },
    });
    assertEqual(noShellChangedResult.status, 0, `changed non-shell syntax path should not scan unchanged broken shell files\nstdout:\n${noShellChangedResult.stdout}\nstderr:\n${noShellChangedResult.stderr}`);
    assertIncludes(noShellChangedResult.stdout, 'mode=changed', 'changed non-shell syntax path should report changed mode');
    assertIncludes(noShellChangedResult.stdout, 'checked=0', 'changed non-shell syntax path should not check unrelated files');

    const fullResult = runShellSyntaxCheck({
      repoRoot,
      env: {
        ...process.env,
        AIOS_SHELL_SYNTAX_CHANGED_FILES: '',
        AIOS_SHELL_SYNTAX_CHANGED_SCOPE: 'full',
      },
    });
    assertFalse(fullResult.status === 0, 'full shell syntax path should still catch unchanged broken shell files');
    assertIncludes(fullResult.stderr, 'syntax error', 'full shell syntax path should expose bash syntax failures');
    assertNotIncludes(
      changedResult.stderr,
      'unchanged-broken.sh',
      'changed shell syntax path should not scan unchanged shell files',
    );
  } finally {
    removeSchedulerTempWorkspace(repoRoot);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerSchedulerShellBehaviorCheck();
  reportOk('shell syntax changed-file fast path passed.');
}
