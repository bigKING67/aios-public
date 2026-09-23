#!/usr/bin/env node

/**
 * Keeps marketing content asset Python workers from regressing into mega-files.
 */

import {
  auditLineBudgetFiles,
  buildLineBudgetAllowlist,
  createCheckGuard,
  getRepoRoot,
  listGitFiles,
  readLineBudgetConfig,
  reportLineBudgetFailures,
} from '../../lib/shared/guard-utils.mjs';

const CONFIG_PATH = 'scripts/config/allowlists/marketing-content-assets-python-size-allowlist.json';
const SOURCE_PATH_ARGS = ['etl/groland_postgres/scripts/marketing_content_assets'];
const { fail, reportOk } = createCheckGuard('marketing-content-assets-python-size');

function main() {
  const repoRoot = getRepoRoot();
  const config = readLineBudgetConfig(repoRoot, CONFIG_PATH, fail);
  const allowlist = buildLineBudgetAllowlist(config, {
    configPath: CONFIG_PATH,
    fail,
  });
  const files = listGitFiles(SOURCE_PATH_ARGS, {
    cwd: repoRoot,
    filter: (file) => file.endsWith('.py'),
  });
  const auditResult = auditLineBudgetFiles(repoRoot, files, config, {
    allowlist,
    allowlistedViolationReason: 'Allowlisted legacy content asset Python worker grew beyond its frozen cap.',
    globalViolationReason: 'Content asset Python worker file exceeds the module-size threshold.',
  });

  reportLineBudgetFailures(auditResult, {
    configPath: CONFIG_PATH,
    guardName: 'marketing-content-assets-python-size',
    missingHeader: 'Found allowlist entries for missing content asset Python files:',
    staleHeader: 'Found allowlisted content asset Python files now under the global threshold:',
    violationHeader: 'Found oversized marketing content asset Python worker files:',
    violationFooter:
      'Split large workers into focused runtime/video-input/repository/provider modules, or add a temporary allowlist entry with a frozen cap and reason.',
  });

  reportOk(
    `scanned ${files.length} content asset Python files; max ${config.maxLines} lines; ${allowlist.size} frozen legacy exceptions.`,
  );
}

main();
