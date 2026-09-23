/**
 * Historical static gate order consumed by the quality-runner registry.
 *
 * scripts/verify-ci.sh is now only a thin quality-runner wrapper. Keep this
 * manifest as the semantic source for legacy gate labels and order invariants.
 */

import { VERIFY_CI_META_GATES } from './verify-ci-meta-gates.mjs';
import { WEEKLY_BOUNDARY_EXPECTED_GATES } from '../weekly/weekly-boundary-gates.mjs';
import {
  WEEKLY_BEHAVIOR_EXPECTED_GATES,
  WEEKLY_BEHAVIOR_MANIFEST_GATES,
} from '../weekly/weekly-behavior-gates.mjs';
import {
  QUALITY_RUNNER_SLICE_DEFINITIONS,
} from '../quality/quality-runner-slices.mjs';
import {
  REPO_GOVERNANCE_EXPECTED_GATES,
} from '../repo/repo-governance-gates.mjs';
import {
  DESIGN_ADAPTER_RUN_GATES,
  DESIGN_FOUNDATION_RUN_GATES,
  DESIGN_REGISTRY_RUN_GATES,
  DESIGN_TOKEN_HELPER_RUN_GATES,
} from './verify-ci-design-run-gates.mjs';
import {
  FRONTEND_DELIVERY_RUN_GATES,
  FRONTEND_DELIVERY_TERMINAL_RUN_GATES,
  FRONTEND_EARLY_STRUCTURE_RUN_GATES,
  FRONTEND_LATE_STRUCTURE_RUN_GATES,
  FRONTEND_POST_SHELL_RUN_GATES,
} from './verify-ci-frontend-run-gates.mjs';
import {
  gate,
  makeGateFinder,
} from './verify-ci-run-gate-utils.mjs';

const repoGovernanceGate = makeGateFinder(
  REPO_GOVERNANCE_EXPECTED_GATES,
  'REPO_GOVERNANCE_EXPECTED_GATES',
);
const QUALITY_RUNNER_SELF_CHECK_GATES = Object.freeze(
  QUALITY_RUNNER_SLICE_DEFINITIONS.map((definition) => ({
    name: definition.name,
    label: definition.label,
  })),
);

const REPO_GOVERNANCE_RUN_GATES = Object.freeze([
  repoGovernanceGate('verify:repo:naming-behavior'),
  repoGovernanceGate('verify:repo:naming'),
  repoGovernanceGate('verify:repo:source-size-governance-behavior'),
  repoGovernanceGate('verify:repo:source-size-governance'),
  repoGovernanceGate('verify:repo:trellis-spec-compact-behavior'),
  repoGovernanceGate('verify:repo:trellis-spec-compact'),
  repoGovernanceGate('verify:repo:workspace-doctor-behavior'),
  repoGovernanceGate('verify:repo:workspace-doctor'),
  repoGovernanceGate('verify:repo:backend-cargo-governance'),
  repoGovernanceGate('verify:repo:agent-workflow'),
  repoGovernanceGate('verify:repo:trellis-runtime-hygiene-behavior'),
  repoGovernanceGate('verify:repo:trellis-archive-export-behavior'),
  repoGovernanceGate('verify:repo:trellis-finish-work-scope-behavior'),
  repoGovernanceGate('verify:repo:trellis-finish-work-scope'),
]);

const DEPLOY_CONFIG_RUN_GATES = Object.freeze([
  gate('verify:deploy:dashboard-latency-systemd-behavior', '[verify:ci] dashboard latency systemd behavior'),
  gate('verify:deploy:config-behavior', '[verify:ci] deploy config behavior'),
  gate('verify:deploy:config', '[verify:ci] deploy config'),
  gate('verify:deploy:vps-git-state:smoke', '[verify:ci] VPS Git state runtime smoke'),
]);

export const VERIFY_CI_RUN_GATES = Object.freeze([
  gate('lint', '[verify:ci] lint'),
  gate('lint:scripts', '[verify:ci] scripts lint surface'),
  ...VERIFY_CI_META_GATES,
  ...QUALITY_RUNNER_SELF_CHECK_GATES,
  gate('verify:ci:eslint-source-coverage-behavior', '[verify:ci] ESLint source coverage behavior'),
  gate('verify:ci:dependency-audit-behavior', '[verify:ci] dependency audit exception behavior'),
  gate('audit:dependencies:npm', '[verify:ci] npm production dependency audit'),
  gate('audit:dependencies:python', '[verify:ci] Python production dependency audit'),
  gate('audit:dependencies:rust', '[verify:ci] Rust dependency audit'),
  gate('verify:api-contract-behavior', '[verify:ci] generated API contract behavior'),
  gate('verify:api-contract', '[verify:ci] generated API contract drift'),
  gate('verify:migrations:aios-behavior', '[verify:ci] migration ledger behavior'),
  gate('verify:migrations:aios-ledger-bootstrap-behavior', '[verify:ci] migration ledger canonical v2 bootstrap writer behavior'),
  gate('verify:migrations:aios-sample-inventory-forward-cutover-behavior', '[verify:ci] sample inventory backend-only forward cutover behavior'),
  gate('verify:migrations:aios-sample-inventory-public-cutover-behavior', '[verify:ci] sample inventory backend/015 public cutover behavior'),
  gate('verify:migrations:aios-sample-inventory-approval-stock-cutover-behavior', '[verify:ci] sample inventory backend/017 approval-stock cutover behavior'),
  gate('verify:migrations:aios-agent-context-cutover-behavior', '[verify:ci] Agent backend/018-020 atomic cutover behavior'),
  gate('verify:migrations:aios-taobao-goods-forward-cutover-behavior', '[verify:ci] Taobao goods warehouse repair forward cutover behavior'),
  gate('verify:migrations:aios-identity-forward-cutover-behavior', '[verify:ci] AIOS identity maintenance cutover behavior'),
  gate('verify:migrations:aios-taobao-goods-schema-contract-forward-cutover-behavior', '[verify:ci] Taobao goods runtime schema contract forward cutover behavior'),
  gate('verify:migrations:aios', '[verify:ci] migration filesystem governance'),
  gate('verify:migrations:aios-owner-reviewed-overlay-behavior', '[verify:ci] migration owner-reviewed offline overlay behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-cutover-behavior', '[verify:ci] qianchuan production cutover readiness behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migrations-behavior', '[verify:ci] qianchuan production migration reconciliation behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-review-decisions-behavior', '[verify:ci] qianchuan owner review decision behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-p1c-review-decisions-behavior', '[verify:ci] qianchuan P1C owner review decision behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-p1d-lineage-behavior', '[verify:ci] qianchuan P1D lineage behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-p1d-readonly-probe-behavior', '[verify:ci] qianchuan P1D read-only probe behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-readonly-probe-behavior', '[verify:ci] qianchuan influencer-tag read-only probe behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-repair-plan-behavior', '[verify:ci] qianchuan influencer-tag repair plan behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage1-behavior', '[verify:ci] qianchuan influencer-tag Stage 1 behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage2-behavior', '[verify:ci] qianchuan influencer-tag Stage 2 behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-parse-helper-forward-contract-plan-behavior', '[verify:ci] qianchuan parse-helper forward-contract plan behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-parse-helper-readonly-probe-behavior', '[verify:ci] qianchuan parse-helper read-only probe behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-platform-video-identity-contract-plan-behavior', '[verify:ci] qianchuan platform-video identity contract plan behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-ledger-bootstrap-plan-behavior', '[verify:ci] qianchuan migration ledger bootstrap plan behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-alimama-runtime-retirement-plan-behavior', '[verify:ci] qianchuan Alimama runtime retirement plan behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-card-ratio-readonly-probe-behavior', '[verify:ci] qianchuan card-ratio read-only probe behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-card-ratio-repair-plan-behavior', '[verify:ci] qianchuan card-ratio repair plan behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-card-ratio-stage1-behavior', '[verify:ci] qianchuan card-ratio Stage 1 behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-card-ratio-stage2-behavior', '[verify:ci] qianchuan card-ratio Stage 2 behavior'),
  gate('verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior', '[verify:ci] qianchuan P1D owner review decision behavior'),
  ...REPO_GOVERNANCE_RUN_GATES,
  ...DEPLOY_CONFIG_RUN_GATES,
  ...DESIGN_FOUNDATION_RUN_GATES,
  ...DESIGN_TOKEN_HELPER_RUN_GATES,
  ...DESIGN_ADAPTER_RUN_GATES,
  ...DESIGN_REGISTRY_RUN_GATES,
  ...FRONTEND_EARLY_STRUCTURE_RUN_GATES,
  ...WEEKLY_BOUNDARY_EXPECTED_GATES,
  ...WEEKLY_BEHAVIOR_MANIFEST_GATES,
  ...WEEKLY_BEHAVIOR_EXPECTED_GATES,
  ...FRONTEND_LATE_STRUCTURE_RUN_GATES,
  ...FRONTEND_DELIVERY_RUN_GATES,
  gate('test:frontend:unit', '[verify:ci] frontend unit tests'),
  gate('test:etl:unit', '[verify:ci] ETL unit tests'),
  gate('build', '[verify:ci] build'),
  ...FRONTEND_DELIVERY_TERMINAL_RUN_GATES,
  gate('type-check', '[verify:ci] type-check'),
  gate('verify:backend', '[verify:ci] backend gate'),
  gate('verify:shell:syntax', '[verify:ci] shell syntax check'),
]);

export const VERIFY_CI_POST_SHELL_GATES = FRONTEND_POST_SHELL_RUN_GATES;
