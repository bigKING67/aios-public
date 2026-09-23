#!/usr/bin/env node

/**
 * Freezes legacy default Tailwind palette utility usage and blocks arbitrary
 * raw-color utilities plus legacy compatibility color aliases.
 *
 * Tailwind utility classes are a design-token consumption surface. Product
 * source files should use AIOS aliases such as text-text-primary,
 * bg-bg-card, border-border-color, text-status-*, text-trend-*,
 * text-brand-*, and platform/domain chart constants instead of default
 * Tailwind palette classes like text-gray-500 or bg-white. Raw arbitrary
 * color utilities such as bg-[#fff] or shadow-[0_1px_2px_rgba(...)] are not
 * allowlisted; create a token alias first. Compatibility aliases such as
 * text-primary, bg-primary-500, or bg-warning-50 must not be used in product
 * class strings or global CSS utility definitions; use explicit semantic
 * aliases such as text-text-primary, bg-brand-primary, and
 * bg-status-warning-soft instead.
 */

import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  reportTailwindUtilityColorAudit,
} from '../../lib/design/tailwind-utility-color-check.mjs';

export {
  auditTailwindUtilityColors,
  countTailwindUtilitiesInRepo,
  countTailwindUtilitiesInRepoFile,
  formatTailwindUtilityColorDebtSummary,
  formatTailwindUtilityColorViolation,
  listTailwindUtilityColorCandidateFiles,
  loadTailwindUtilityColorAllowlist,
  reportTailwindUtilityColorAudit,
  TAILWIND_UTILITY_COLOR_ALLOWLIST_CONFIG_PATH,
  TAILWIND_UTILITY_COLOR_SOURCE_PATHS,
} from '../../lib/design/tailwind-utility-color-check.mjs';

export {
  classLiteralSurfaces,
  compareTailwindUtilityCounts,
  countTailwindColorUtilitiesInFiles,
  countTailwindColorUtilitiesInLines,
  countTailwindColorUtilitiesInSource,
  countTailwindUtilityOccurrences,
  extractMultilineTemplateSurfaces,
  extractStringLiterals,
  findTailwindColorUtilities,
  isClassContextLine,
  isClassLikeLiteral,
  isSupportedTailwindUtilityAllowlistKey,
  isUtilityLikeToken,
  skipQuotedString,
  stripTailwindUtilityComments,
  stripVariantPrefixes,
} from '../../lib/design/tailwind-utility-color-core.mjs';

const { fail, reportOk } = createCheckGuard('tailwind-utility-colors', { errorPrefix: '' });

function main() {
  reportTailwindUtilityColorAudit({
    fail,
    repoRoot: getRepoRoot(),
    reportOk,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
