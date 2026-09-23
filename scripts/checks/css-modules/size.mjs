#!/usr/bin/env node

/**
 * Keeps CSS Modules from turning into page-sized style dumps.
 *
 * The allowlist file is retained even when empty so CI has an explicit,
 * versioned "no legacy exceptions" baseline. New CSS Modules should stay under
 * the global line threshold or be split by page section, component boundary,
 * or domain concern.
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

const CONFIG_PATH = 'scripts/config/allowlists/css-module-size-allowlist.json';
const SOURCE_PATH_ARGS = ['apps/web-vite/src'];
const { fail, reportOk } = createCheckGuard('css-module-size');

export function readCssModuleSizeConfig(repoRoot) {
  return readLineBudgetConfig(repoRoot, CONFIG_PATH, fail);
}

export function listCssModules(repoRoot) {
  return listGitFiles(SOURCE_PATH_ARGS, {
    cwd: repoRoot,
    filter: (file) => file.endsWith('.module.css'),
  });
}

export function buildCssModuleSizeAllowlist(config, options = {}) {
  const { fail: failFn = fail } = options;
  return buildLineBudgetAllowlist(config, {
    configPath: CONFIG_PATH,
    fail: failFn,
    validateEntry(entry) {
      if (!entry.path.endsWith('.module.css')) {
        failFn(`${entry.path} must be a CSS Module path`);
      }
    },
  });
}

export function auditCssModuleSize({
  allowlist,
  config,
  countLines,
  files,
  repoRoot = '',
}) {
  return auditLineBudgetFiles(
    repoRoot,
    files,
    config,
    {
      allowlist,
      countLines,
      allowlistedViolationReason: 'Allowlisted CSS Module grew beyond its frozen cap.',
      globalViolationReason: 'CSS Module exceeds the global stylesheet-size threshold.',
    },
  );
}

export function cssModuleSizeExceptionSummary(allowlist) {
  return allowlist.size === 0
    ? 'clean baseline; no frozen legacy exceptions.'
    : `${allowlist.size} frozen legacy exceptions.`;
}

function main() {
  const repoRoot = getRepoRoot();
  const config = readCssModuleSizeConfig(repoRoot);
  const allowlist = buildCssModuleSizeAllowlist(config);
  const files = listCssModules(repoRoot);
  const auditResult = auditCssModuleSize({
    allowlist,
    config,
    files,
    repoRoot,
  });

  reportLineBudgetFailures(auditResult, {
    configPath: CONFIG_PATH,
    guardName: 'css-module-size',
    missingHeader: 'Found allowlist entries for missing files:',
    staleHeader: 'Found allowlisted CSS Modules now under the global threshold:',
    violationHeader: 'Found oversized CSS Modules:',
    violationFooter:
      'Split oversized stylesheets by page section/component, or add a temporary allowlist entry with a frozen cap and reason.',
  });

  reportOk(`scanned ${files.length} CSS Modules; max ${config.maxLines} lines; ${cssModuleSizeExceptionSummary(allowlist)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
