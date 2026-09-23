/**
 * Backward-compatible facade for inline visual style audit helpers.
 */

export {
  checkInlineVisualStyleAudit,
  formatInlineVisualStyleDebtSummary,
  listInlineVisualStyleSourceFiles,
} from './inline-visual-style-core.mjs';

export {
  auditInlineVisualStyleFile,
} from './inline-visual-style-parser.mjs';

export {
  runInlineVisualStyleAudit,
} from './inline-visual-style-runner.mjs';
