#!/usr/bin/env node

/**
 * Verifies that Tailwind design-system color aliases stay token-backed.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
} from '../../lib/shared/guard-utils.mjs';
import {
  auditTailwindTokenAliases,
  DESIGN_CSS_PATH,
  formatTailwindTokenAliasFailure,
  hasTailwindTokenAliasViolations,
  TAILWIND_CONFIG_PATH,
} from '../../lib/design/tailwind-token-aliases-core.mjs';

const { fail, reportOk } = createCheckGuard('tailwind-token-aliases', { errorPrefix: '' });

const repoRoot = getRepoRoot();
assertRepoRoot(repoRoot, fail);

const tailwindConfig = readRequiredFile(repoRoot, TAILWIND_CONFIG_PATH, fail);
const designCss = readRequiredFile(repoRoot, DESIGN_CSS_PATH, fail);
const findings = auditTailwindTokenAliases(tailwindConfig, designCss, { fail });

if (hasTailwindTokenAliasViolations(findings)) {
  console.error(formatTailwindTokenAliasFailure(findings));
  process.exit(1);
}

reportOk(`${TAILWIND_CONFIG_PATH} color aliases are token-backed and raw-color free.`);
