/**
 * Backward-compatible facade for guard budget helpers.
 */

export {
  auditCappedCountFiles,
  buildCappedCountAllowlist,
  readCappedCountAllowlistConfig,
  reportCappedCountAllowlistMaintenanceFailures,
} from './guard-capped-counts.mjs';

export {
  auditLineBudgetFiles,
  buildLineBudgetAllowlist,
  readLineBudgetConfig,
  reportLineBudgetFailures,
} from './guard-line-budgets.mjs';
