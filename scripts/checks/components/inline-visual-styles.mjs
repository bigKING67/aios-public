#!/usr/bin/env node

/**
 * Shared component inline visual-style audit.
 *
 * Shared components should prefer CSS Modules, Tailwind token aliases, or
 * component props over visual inline styles. Existing inline visual styles are
 * frozen by file so the debt can shrink but not grow.
 */

import { runInlineVisualStyleAudit } from '../../lib/frontend/inline-visual-style-audit.mjs';

runInlineVisualStyleAudit({
  label: 'shared-inline-visual-styles',
  configPath: 'scripts/config/allowlists/shared-inline-visual-style-allowlist.json',
  sourceRoot: 'apps/web-vite/src/components',
  sourceDescription: 'shared component',
});
