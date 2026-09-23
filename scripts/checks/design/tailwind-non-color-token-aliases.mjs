#!/usr/bin/env node

/**
 * Verifies that Tailwind non-color theme aliases stay aligned with AIOS
 * runtime tokens. Tailwind is a token consumption surface: theme aliases should
 * point at apps/web-vite/src/styles/design-tokens.css variables, except screens which must
 * stay static literals for media query generation.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
  readRequiredJsonFile,
} from '../../lib/shared/guard-utils.mjs';
import {
  DESIGN_CSS_PATH,
  TOKEN_JSON_PATH,
  auditTailwindNonColorTokenAliases,
  formatTailwindNonColorTokenAliasFailure,
} from '../../lib/design/tailwind-non-color-token-aliases-core.mjs';

export {
  auditTailwindNonColorTokenAliases,
  formatTailwindNonColorTokenAliasFailure,
} from '../../lib/design/tailwind-non-color-token-aliases-core.mjs';

const TAILWIND_CONFIG_PATH = 'tailwind.config.ts';
const { fail, reportOk } = createCheckGuard('tailwind-non-color-token-aliases', { errorPrefix: '' });

async function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const tokens = readRequiredJsonFile(repoRoot, TOKEN_JSON_PATH, fail);
  const { findings } = auditTailwindNonColorTokenAliases({
    designCss: readRequiredFile(repoRoot, DESIGN_CSS_PATH, fail),
    tailwindConfig: readRequiredFile(repoRoot, TAILWIND_CONFIG_PATH, fail),
    tokens,
  }, { fail });

  if (findings.length > 0) {
    console.error(formatTailwindNonColorTokenAliasFailure(findings));
    process.exit(1);
  }

  reportOk('Tailwind spacing, radius, shadow, typography, breakpoint, and transition aliases match runtime design tokens.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
