#!/usr/bin/env node

import {
  checkFrontendPreviewContract,
} from '../../lib/frontend/frontend-preview-contract-core.mjs';
import {
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';

export {
  auditFrontendPreviewContract,
  checkFrontendPreviewContract,
  formatFrontendPreviewContractFailure,
  summarizeFrontendPreviewContract,
} from '../../lib/frontend/frontend-preview-contract-core.mjs';

const result = checkFrontendPreviewContract(getRepoRoot());
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.status !== 0) {
  process.exit(result.status);
}
