/**
 * Keeps frontend components from regressing into mega-files.
 *
 * The allowlist file is retained even when empty so CI has an explicit,
 * versioned "no legacy exceptions" baseline. New frontend TSX/JSX files
 * should stay under the global line threshold or be split into focused
 * components/hooks/helpers before merging.
 */

import {
  auditLineBudgetFiles,
  buildLineBudgetAllowlist,
  listGitFiles,
  readLineBudgetConfig,
} from '../shared/guard-utils.mjs';

export const FRONTEND_COMPONENT_SIZE_CONFIG_PATH = 'scripts/config/allowlists/frontend-component-size-allowlist.json';
export const FRONTEND_COMPONENT_SIZE_SOURCE_PATH_ARGS = ['apps/web-vite/src/app', 'apps/web-vite/src/components'];

function throwFailure(message) {
  throw new Error(message);
}

export function readFrontendComponentSizeConfig(repoRoot, options = {}) {
  return readLineBudgetConfig(
    repoRoot,
    FRONTEND_COMPONENT_SIZE_CONFIG_PATH,
    options.fail ?? throwFailure,
  );
}

export function listFrontendComponentSizeFiles(repoRoot) {
  return listGitFiles(FRONTEND_COMPONENT_SIZE_SOURCE_PATH_ARGS, {
    cwd: repoRoot,
    filter: (file) => /\.(?:tsx|jsx)$/.test(file),
  });
}

export function buildFrontendComponentSizeAllowlist(config, options = {}) {
  return buildLineBudgetAllowlist(config, {
    configPath: FRONTEND_COMPONENT_SIZE_CONFIG_PATH,
    fail: options.fail ?? throwFailure,
  });
}

export function checkFrontendComponentSize({
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
      allowlistedViolationReason: 'Allowlisted file grew beyond its frozen cap.',
      globalViolationReason: 'File exceeds the global frontend component-size threshold.',
    },
  );
}

export function formatFrontendComponentSizeExceptionSummary(allowlist) {
  return allowlist.size === 0
    ? 'clean baseline; no frozen legacy exceptions.'
    : `${allowlist.size} frozen legacy exceptions.`;
}
