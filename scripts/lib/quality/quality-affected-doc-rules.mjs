import {
  TRELLIS_FINISH_WORK_SCOPE_GATE_NAMES,
  TRELLIS_SPEC_COMPACT_GATE_NAMES,
} from '../repo/repo-governance-gates.mjs';

const DOCS_DRIFT_GATES = Object.freeze([
  'verify:design:docs',
  'verify:design:docs-behavior',
  'verify:frontend:quality-docs-drift',
  'verify:frontend:quality-docs-drift-behavior',
]);

const FINISH_WORK_CONTRACT_DOCS = new Set([
  '.trellis/workflow.md',
  '.agents/skills/trellis-finish-work/SKILL.md',
  '.pi/prompts/trellis-finish-work.md',
]);

const AGENT_WORKFLOW_CONTRACT_DOCS = new Set([
  'AGENTS.md',
  'PLANS.md',
  'code_review.md',
]);

export function docsAffectedRule(file) {
  if (FINISH_WORK_CONTRACT_DOCS.has(file)) {
    return {
      gates: [...DOCS_DRIFT_GATES, ...TRELLIS_FINISH_WORK_SCOPE_GATE_NAMES],
      reason: `${file}: Trellis finish-work contract change`,
    };
  }

  if (AGENT_WORKFLOW_CONTRACT_DOCS.has(file)) {
    return {
      gates: [...DOCS_DRIFT_GATES, 'verify:repo:agent-workflow'],
      reason: `${file}: agent planning and review contract change`,
    };
  }

  if (file.startsWith('.trellis/spec/') && file.endsWith('.md')) {
    return {
      gates: [...DOCS_DRIFT_GATES, ...TRELLIS_SPEC_COMPACT_GATE_NAMES],
      reason: `${file}: Trellis spec compactness and docs drift change`,
    };
  }

  if (
    file === 'README.md'
    || file === 'DESIGN.md'
    || file === 'apps/web-vite/AGENTS.md'
    || file.startsWith('docs/')
    || file.startsWith('apps/web-vite/src/docs/')
    || file.endsWith('.md')
  ) {
    return {
      gates: DOCS_DRIFT_GATES,
      reason: `${file}: docs drift change`,
    };
  }

  return null;
}
