#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { runInlineVisualStyleAuditBehavior } from '../../lib/frontend/inline-visual-style-audit-behavior.mjs';

const assertions = createCheckGuard('shared-inline-visual-styles-behavior');

runInlineVisualStyleAuditBehavior({
  allowlistPath: 'scripts/config/allowlists/shared-inline-visual-style-allowlist.json',
  assertions,
  guardLabel: 'shared-inline-visual-styles',
  outOfScopeFile: 'apps/web-vite/src/app/OutOfScope.tsx',
  outOfScopeMessage: 'App scope is audited separately',
  passingFileCount: 1,
  sourceDescription: 'shared component',
  sourceRoot: 'apps/web-vite/src/components',
  tempRepoPrefix: 'aios-shared-inline-visual-styles-',
});

assertions.reportOk(
  'pass, visual violations, allowlist cap, stale, missing, reduced, scope, and false-positive checks passed.',
);
