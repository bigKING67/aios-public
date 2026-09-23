#!/usr/bin/env node

/**
 * Keeps frontend components from regressing into mega-files.
 */

import {
  createCheckGuard,
  getRepoRoot,
  reportLineBudgetFailures,
} from '../../lib/shared/guard-utils.mjs';
import {
  buildFrontendComponentSizeAllowlist,
  checkFrontendComponentSize,
  formatFrontendComponentSizeExceptionSummary,
  FRONTEND_COMPONENT_SIZE_CONFIG_PATH,
  listFrontendComponentSizeFiles,
  readFrontendComponentSizeConfig,
} from '../../lib/frontend/frontend-component-size-core.mjs';

const { fail, reportOk } = createCheckGuard('frontend-component-size');

const repoRoot = getRepoRoot();
const config = readFrontendComponentSizeConfig(repoRoot, { fail });
const allowlist = buildFrontendComponentSizeAllowlist(config, { fail });
const files = listFrontendComponentSizeFiles(repoRoot);
const auditResult = checkFrontendComponentSize({
  allowlist,
  config,
  files,
  repoRoot,
});

reportLineBudgetFailures(auditResult, {
  configPath: FRONTEND_COMPONENT_SIZE_CONFIG_PATH,
  guardName: 'frontend-component-size',
  missingHeader: 'Found allowlist entries for missing files:',
  staleHeader: 'Found allowlisted files now under the global threshold:',
  violationHeader: 'Found oversized frontend component files:',
  violationFooter:
    'Split large files into focused components/hooks/helpers, or add a temporary allowlist entry with a frozen cap and reason.',
});

reportOk(`scanned ${files.length} frontend TSX/JSX files; max ${config.maxLines} lines; ${formatFrontendComponentSizeExceptionSummary(allowlist)}`);
