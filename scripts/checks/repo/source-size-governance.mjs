#!/usr/bin/env node

import {
  SOURCE_SIZE_GOVERNANCE_CONFIG,
  SOURCE_SIZE_GOVERNANCE_GUARD,
  runSourceSizeGovernanceAudit,
  summarizeSourceSizeGovernance,
} from '../../lib/repo/source-size-governance-core.mjs';
import { createCheckGuard, getRepoRoot } from '../../lib/shared/guard-utils.mjs';

const { fail, reportOk } = createCheckGuard(SOURCE_SIZE_GOVERNANCE_GUARD);

const result = runSourceSizeGovernanceAudit(getRepoRoot());
if (result.findings.length > 0) {
  fail([
    `source-size governance failed (${SOURCE_SIZE_GOVERNANCE_CONFIG})`,
    ...result.findings.map((finding) => `- ${finding}`),
  ].join('\n'));
}

reportOk(summarizeSourceSizeGovernance(result));
