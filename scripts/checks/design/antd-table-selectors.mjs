#!/usr/bin/env node

/**
 * Freezes AntD table deep selectors behind an explicit allowlist.
 */

import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  formatAntdTableSelectorAuditFailures,
  runAntdTableSelectorAudit,
} from '../../lib/design/antd-table-selectors-core.mjs';

const { fail, reportOk } = createCheckGuard('antd-table-selector-audit');

const repoRoot = getRepoRoot();
const { auditResult, summary } = runAntdTableSelectorAudit(repoRoot, { fail });
const failure = formatAntdTableSelectorAuditFailures(auditResult);

if (failure) {
  console.error(failure.trimEnd());
  process.exit(1);
}

reportOk(summary);
