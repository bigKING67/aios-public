#!/usr/bin/env node

import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  QUALITY_RUNNER_COMMAND_LAYOUT_GUARD_NAME,
  checkCommandLayout,
} from '../../lib/quality/quality-command-layout-core.mjs';

export {
  ALLOWED_LIB_DOMAINS,
  ALLOWED_ROOT_SCRIPT_FILES,
  CHECKS_DOMAIN_FILE_PATTERN,
  QUALITY_RUNNER_COMMAND_LAYOUT_GUARD_NAME,
  RETIRED_LIB_DOMAINS,
  ROOT_FLAT_CHECK_LIMIT,
  checkCommandLayout,
  listFilesRecursive,
  readFirstLine,
  toPosixPath,
} from '../../lib/quality/quality-command-layout-core.mjs';
export {
  LEGACY_ROOT_CHECK_REFERENCE_ALLOWED_PATHS,
  MIGRATED_LEGACY_CHECK_PATHS,
} from '../../lib/quality/quality-command-layout-legacy-paths.mjs';

const {
  fail,
  reportOk,
} = createCheckGuard(QUALITY_RUNNER_COMMAND_LAYOUT_GUARD_NAME, { errorPrefix: '' });

const findings = checkCommandLayout({ repoRoot: getRepoRoot() });

if (findings.length > 0) {
  console.error(`[${QUALITY_RUNNER_COMMAND_LAYOUT_GUARD_NAME}] check command layout drift was detected:`);
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  console.error('\nKeep executable check commands in scripts/checks/<domain>/ and reusable code in scripts/lib/.');
  fail(`${findings.length} layout finding(s)`);
}

reportOk('check command layout is synchronized.');
