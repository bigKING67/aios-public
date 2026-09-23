#!/usr/bin/env node

/**
 * App route inline visual-style audit.
 *
 * Route-local components should prefer CSS Modules, Tailwind token aliases, or
 * component props over visual inline styles. Existing route-level debt is
 * frozen by file so new work cannot increase it.
 */

import { runInlineVisualStyleAudit } from '../../lib/frontend/inline-visual-style-audit.mjs';

runInlineVisualStyleAudit({
  label: 'app-inline-visual-styles',
  configPath: 'scripts/config/allowlists/app-inline-visual-style-allowlist.json',
  sourceRoot: 'apps/web-vite/src/app',
  sourceDescription: 'app route',
});
