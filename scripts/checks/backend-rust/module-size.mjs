#!/usr/bin/env node

/**
 * Keeps backend Rust modules from regressing into larger mega-files.
 *
 * Existing large files are explicitly allowlisted with frozen per-file caps.
 * New Rust modules should stay below the global threshold or be split by
 * handler/query/domain/cache/client boundary before merging.
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

const CONFIG_PATH = 'scripts/config/allowlists/backend-rust-module-size-allowlist.json';
const SOURCE_PATH_ARGS = ['backend-rust/src'];
const { fail, reportOk } = createCheckGuard('backend-rust-module-size');

function readConfig(repoRoot) {
  return readLineBudgetConfig(repoRoot, CONFIG_PATH, fail);
}

function listBackendRustFiles(repoRoot) {
  return listGitFiles(SOURCE_PATH_ARGS, {
    cwd: repoRoot,
    filter: (file) => file.endsWith('.rs'),
  });
}

function buildAllowlist(config) {
  return buildLineBudgetAllowlist(config, {
    configPath: CONFIG_PATH,
    fail,
  });
}

function main() {
  const repoRoot = getRepoRoot();
  const config = readConfig(repoRoot);
  const allowlist = buildAllowlist(config);
  const files = listBackendRustFiles(repoRoot);
  const auditResult = auditLineBudgetFiles(repoRoot, files, config, {
    allowlist,
    allowlistedViolationReason: 'Allowlisted legacy Rust file grew beyond its frozen cap.',
    globalViolationReason: 'Rust backend file exceeds the global module-size threshold.',
  });

  reportLineBudgetFailures(auditResult, {
    configPath: CONFIG_PATH,
    guardName: 'backend-rust-module-size',
    missingHeader: 'Found allowlist entries for missing Rust files:',
    staleHeader: 'Found allowlisted Rust files now under the global threshold:',
    violationHeader: 'Found oversized backend Rust modules:',
    violationFooter:
      'Split large modules into focused handler/query/domain/cache/client files, or add a temporary allowlist entry with a frozen cap and reason.',
  });

  reportOk(
    `scanned ${files.length} backend Rust files; max ${config.maxLines} lines; ${allowlist.size} frozen legacy exceptions.`,
  );
}

main();
