#!/usr/bin/env node

/**
 * Trellis spec compactness audit.
 *
 * Specs should stay as short, stable pointers. Long operational detail belongs
 * in docs/runbooks or external artifacts so Trellis remains a context reducer.
 */

import {
  runTrellisSpecCompactCheck,
} from '../../lib/repo/trellis-spec-compact-core.mjs';

export {
  auditTrellisSpecFile,
  auditTrellisSpecFiles,
  formatTrellisSpecCompactFindings,
  formatTrellisSpecCompactWarning,
  isTrellisSpecMarkdownFile,
  listTrellisSpecMarkdownFiles,
  runTrellisSpecCompactCheck,
  summarizeTrellisSpecFiles,
} from '../../lib/repo/trellis-spec-compact-core.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  runTrellisSpecCompactCheck();
}
