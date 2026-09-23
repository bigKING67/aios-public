#!/usr/bin/env node

/**
 * Keeps app route entries thin.
 *
 * App route page files should wire routing/search params and delegate
 * substantial state, effects, data fetching, handlers, and presentation to
 * colocated modules. The allowlist file is intentionally retained even when
 * empty so CI has an explicit, versioned "no legacy exceptions" baseline.
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
import { listAppPageFiles } from '../../lib/frontend/app-route-paths.mjs';

const CONFIG_PATH = 'scripts/config/allowlists/app-page-size-allowlist.json';
const { fail, reportOk } = createCheckGuard('app-page-size');

export function readAppPageSizeConfig(repoRoot) {
  return readLineBudgetConfig(repoRoot, CONFIG_PATH, fail);
}

export function buildAppPageSizeAllowlist(config, options = {}) {
  return buildLineBudgetAllowlist(config, {
    configPath: CONFIG_PATH,
    fail: options.fail ?? fail,
  });
}

export function checkAppPageSize({
  allowlist,
  config,
  countLines,
  files,
  repoRoot,
}) {
  return auditLineBudgetFiles(
    repoRoot,
    files,
    config,
    {
      allowlist,
      countLines,
      allowlistedViolationReason: 'Allowlisted app page grew beyond its frozen cap.',
      globalViolationReason:
        'App page exceeds the global route-entry size threshold. Move data fetching, local state, handlers, and large presentational sections into _components/hooks/helpers.',
    },
  );
}

export function formatAppPageSizeExceptionSummary(allowlist) {
  return allowlist.size === 0
    ? 'clean baseline; no frozen legacy exceptions.'
    : `${allowlist.size} frozen legacy exceptions.`;
}

function main() {
  const repoRoot = getRepoRoot();
  const config = readAppPageSizeConfig(repoRoot);
  const allowlist = buildAppPageSizeAllowlist(config);
  const files = listAppPageFiles(repoRoot, { listGitFiles });
  const auditResult = checkAppPageSize({
    allowlist,
    config,
    files,
    repoRoot,
  });

  reportLineBudgetFailures(auditResult, {
    configPath: CONFIG_PATH,
    guardName: 'app-page-size',
    missingHeader: 'Found allowlist entries for missing app pages:',
    staleHeader: 'Found allowlisted app pages now under the global threshold:',
    violationHeader: 'Found oversized app page files:',
    violationFooter:
      'Keep route entries thin: split page responsibilities into colocated _components, hooks, and helpers, or add a temporary allowlist entry with a frozen cap and reason.',
  });

  reportOk(`scanned ${files.length} app page files; max ${config.maxLines} lines; ${formatAppPageSizeExceptionSummary(allowlist)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
