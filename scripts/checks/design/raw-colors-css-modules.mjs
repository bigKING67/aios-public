#!/usr/bin/env node

/**
 * CSS Modules raw color audit.
 *
 * Raw hex/rgb/hsl values are allowed only inside material custom-property
 * definitions, for example:
 *   --page-material-brand-glow: rgba(47, 110, 234, 0.18);
 *
 * All ordinary declarations must reference semantic tokens or material aliases.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
  listCssModuleFiles,
  readRepoFileLines,
} from '../../lib/shared/guard-utils.mjs';
import {
  auditCssModuleRawColorFiles,
  formatCssModuleRawColorFailure,
  summarizeCssModuleRawColorAudit,
} from '../../lib/design/raw-colors-css-modules-core.mjs';

export {
  auditCssModuleRawColorFiles,
  auditCssModuleRawColorLines,
  formatCssModuleRawColorFailure,
  summarizeCssModuleRawColorAudit,
} from '../../lib/design/raw-colors-css-modules-core.mjs';

const { fail, reportOk } = createCheckGuard('raw-color-audit', { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const files = listCssModuleFiles(repoRoot);
  const violations = auditCssModuleRawColorFiles(files, {
    readLines: (file) => readRepoFileLines(repoRoot, file, { lineEndingPattern: '\n' }),
  });

  if (violations.length > 0) {
    console.error(formatCssModuleRawColorFailure(violations));
    process.exit(1);
  }

  reportOk(summarizeCssModuleRawColorAudit(files.length));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
