#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { runInlineVisualStyleAuditBehavior } from '../../lib/frontend/inline-visual-style-audit-behavior.mjs';

const assertions = createCheckGuard('app-inline-visual-styles-behavior');

runInlineVisualStyleAuditBehavior({
  allowlistPath: 'scripts/config/allowlists/app-inline-visual-style-allowlist.json',
  assertions,
  guardLabel: 'app-inline-visual-styles',
  outOfScopeFile: 'apps/web-vite/src/components/OutOfScope.tsx',
  outOfScopeMessage: 'Component scope is audited separately',
  passingFileCount: 1,
  sourceDescription: 'app route',
  sourceRoot: 'apps/web-vite/src/app',
  tempRepoPrefix: 'aios-app-inline-visual-styles-',
});

assertions.reportOk(
  'pass, visual violations, allowlist cap, stale, missing, reduced, scope, and false-positive checks passed.',
);
