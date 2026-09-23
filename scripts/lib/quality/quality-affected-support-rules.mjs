import {
  CI_META_GATES,
} from './quality-affected-gates.mjs';

function ciScriptGates(...names) {
  return [...CI_META_GATES, 'lint:scripts', ...names];
}

const BEHAVIOR_GUARD_QUALITY_HELPER_FILES = new Set([
  'scripts/lib/shared/behavior-guard-quality.mjs',
  'scripts/lib/shared/behavior-guard-classifiers.mjs',
  'scripts/lib/shared/behavior-guard-source-scan.mjs',
]);

const DEPLOY_CONFIG_HELPER_FILES = new Set([
  'scripts/lib/deploy/deploy-config-core.mjs',
]);

const DEPLOY_CONFIG_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/deploy/deploy-config-behavior-fixtures.mjs',
  'scripts/lib/deploy/api-deploy-proof-fixtures.mjs',
  'scripts/lib/deploy/api-deploy-proof.sh',
  'scripts/lib/deploy/sample-inventory-public-access-preflight-fixtures.mjs',
]);

const VPS_GIT_STATE_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/deploy/vps-git-state-behavior-fixtures.mjs',
]);

const SHELL_SYNTAX_HELPER_FILES = new Set([
  'scripts/lib/ci/shell-syntax-core.mjs',
]);

const GUARD_UTILS_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/shared/guard-utils-behavior-fixtures.mjs',
]);

const GATE_FIXTURE_UTILS_HELPER_FILES = new Set([
  'scripts/lib/shared/gate-fixture-utils.mjs',
]);

const GATE_FIXTURE_UTILS_BEHAVIOR_FIXTURE_FILES = new Set([
  'scripts/lib/shared/gate-fixture-utils-behavior-fixtures.mjs',
]);

const QIANCHUAN_CARD_RATIO_STAGE2_FILES = new Set([
  'scripts/lib/migrations/aios-qianchuan-production-migration-card-ratio-stage2-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-card-ratio-stage2-source-growth.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-card-ratio-stage2-sql.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-card-ratio-stage2.mjs',
  'scripts/ops/qianchuan-card-ratio-stage2-batch.mjs',
]);

const QIANCHUAN_CARD_RATIO_SHARED_SQL_FILES = new Set([
  'scripts/lib/migrations/aios-qianchuan-production-migration-card-ratio-stage1-sql.mjs',
]);

const QIANCHUAN_CARD_RATIO_READONLY_FILES = new Set([
  'scripts/lib/migrations/aios-qianchuan-production-migration-card-ratio-readonly-probe.mjs',
]);

const QIANCHUAN_INFLUENCER_TAG_NORMALIZATION_SHARED_SQL_FILES = new Set([
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-normalization-sql.mjs',
]);

const QIANCHUAN_INFLUENCER_TAG_READONLY_FILES = new Set([
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-influencer-tag-readonly-probe.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-readonly-probe-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-readonly-probe.mjs',
]);

const QIANCHUAN_INFLUENCER_TAG_REPAIR_PLAN_FILES = new Set([
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-influencer-tag-repair-plan.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-repair-plan-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-repair-plan.mjs',
]);

const QIANCHUAN_INFLUENCER_TAG_STAGE1_FILES = new Set([
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage1-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage1-sql.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage1.mjs',
  'scripts/ops/qianchuan-influencer-tag-stage1.mjs',
]);

const QIANCHUAN_INFLUENCER_TAG_STAGE2_FILES = new Set([
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-influencer-tag-forward-repair-fixtures.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage2-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage2-sql.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-stage2.mjs',
  'scripts/ops/qianchuan-influencer-tag-stage2-batch.mjs',
]);

const QIANCHUAN_INFLUENCER_TAG_FORWARD_REPAIR_DECISION_FILES = new Set([
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-influencer-tag-forward-repair-decisions.behavior-fixtures.mjs',
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-influencer-tag-forward-repair-decisions.mjs',
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-influencer-tag-forward-repair-fixtures.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-forward-repair-decisions-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-influencer-tag-forward-repair-decisions.mjs',
]);

const QIANCHUAN_PARSE_HELPER_FORWARD_CONTRACT_PLAN_FILES = new Set([
  'etl/groland_postgres/sql/migrations/20260725_2300__ensure_marketing_content_report_parse_helpers.sql',
  'etl/groland_postgres/tests/sql/marketing_content_report_parse_helpers_check.sql',
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-parse-helper-forward-contract-plan.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-parse-helper-forward-contract-plan-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-parse-helper-forward-contract-plan.mjs',
]);

const QIANCHUAN_PARSE_HELPER_READONLY_FILES = new Set([
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-parse-helper-readonly-probe.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-parse-helper-readonly-probe-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-parse-helper-readonly-probe.mjs',
]);

const QIANCHUAN_PLATFORM_VIDEO_IDENTITY_READONLY_FILES = new Set([
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-platform-video-identity-readonly-probe.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-platform-video-identity-readonly-probe-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-platform-video-identity-readonly-probe.mjs',
]);

const QIANCHUAN_PLATFORM_VIDEO_IDENTITY_CONTRACT_PLAN_FILES = new Set([
  'etl/groland_postgres/sql/migrations/20260726_1000__enforce_marketing_content_platform_video_identity.sql',
  'etl/groland_postgres/tests/sql/marketing_content_platform_video_identity_check.sql',
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-platform-video-identity-contract-plan.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-platform-video-identity-contract-plan-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-platform-video-identity-contract-plan.mjs',
]);

const QIANCHUAN_LEDGER_BOOTSTRAP_PLAN_FILES = new Set([
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-ledger-exception-owner-overlay.mjs',
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-ledger-bootstrap-plan.mjs',
  'scripts/config/migrations/aios-schema-migrations-v1-to-v2.sql',
  'scripts/config/migrations/aios-schema-migrations.sql',
  'scripts/lib/migrations/aios-migration-history.mjs',
  'scripts/lib/migrations/aios-migration-ledger-bootstrap-manifest.mjs',
  'scripts/lib/migrations/aios-migration-ledger-bootstrap-sql.mjs',
  'scripts/lib/migrations/aios-migration-ledger-bootstrap-writer.mjs',
  'scripts/lib/migrations/aios-migration-ledger-contract.mjs',
  'scripts/lib/migrations/aios-migration-runner-core.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-ledger-exception-owner-overlay-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-ledger-exception-owner-overlay.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-ledger-bootstrap-plan-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-ledger-bootstrap-plan.mjs',
]);

const AIOS_OWNER_REVIEWED_OVERLAY_FILES = new Set([
  'scripts/checks/migrations/aios-production-migration-owner-reviewed-overlay.behavior.mjs',
  'scripts/checks/migrations/aios-production-migration-owner-reviewed-overlay.mjs',
  'scripts/lib/migrations/aios-production-migration-owner-reviewed-overlay-cli.mjs',
  'scripts/lib/migrations/aios-production-migration-owner-reviewed-overlay.mjs',
]);

const AIOS_LEDGER_BOOTSTRAP_WRITER_FILES = new Set([
  'scripts/checks/migrations/aios-migration-ledger-bootstrap.behavior.mjs',
  'scripts/config/migrations/aios-schema-migrations-v1-to-v2.sql',
  'scripts/config/migrations/aios-schema-migrations.sql',
  'scripts/migrations/aios-migration-ledger-bootstrap.mjs',
  'scripts/lib/migrations/aios-migration-history.mjs',
  'scripts/lib/migrations/aios-migration-ledger-bootstrap-manifest.mjs',
  'scripts/lib/migrations/aios-migration-ledger-bootstrap-sql.mjs',
  'scripts/lib/migrations/aios-migration-ledger-bootstrap-writer-cli.mjs',
  'scripts/lib/migrations/aios-migration-ledger-bootstrap-writer.mjs',
  'scripts/lib/migrations/aios-migration-ledger-contract.mjs',
]);

const SAMPLE_INVENTORY_FORWARD_CUTOVER_FILES = new Set([
  '.trellis/spec/repo/sample-inventory-platform.md',
  'docs/SAMPLE_INVENTORY_ARCHITECTURE.md',
  'sql/migrations/014_sample_inventory_transaction_schema.sql',
  'etl/groland_postgres/tests/sql/sample_inventory_transaction_check.sql',
  'scripts/checks/migrations/aios-sample-inventory-forward-cutover.behavior.mjs',
  'scripts/lib/migrations/aios-ledger-free-forward-cutover-engine.mjs',
  'scripts/migrations/aios-sample-inventory-forward-cutover.mjs',
  'scripts/lib/migrations/aios-sample-inventory-forward-cutover-cli.mjs',
  'scripts/lib/migrations/aios-sample-inventory-forward-cutover.mjs',
]);

const SAMPLE_INVENTORY_PUBLIC_CUTOVER_FILES = new Set([
  '.trellis/spec/repo/sample-inventory-platform.md',
  'docs/API_CONTRACT_MIGRATION_GOVERNANCE.md',
  'docs/SAMPLE_INVENTORY_ARCHITECTURE.md',
  'sql/migrations/015_sample_inventory_public_ux_support.sql',
  'etl/groland_postgres/tests/sql/sample_inventory_public_cutover_check.sql',
  'etl/groland_postgres/tests/sql/sample_inventory_transaction_check.sql',
  'scripts/checks/migrations/aios-sample-inventory-public-cutover.behavior.mjs',
  'scripts/checks/migrations/aios-sample-inventory-public-cutover.postgres.mjs',
  'scripts/lib/migrations/aios-ledger-free-forward-cutover-engine.mjs',
  'etl/groland_postgres/scripts/sample_inventory/test_public_cutover_postgres.sh',
  'scripts/migrations/aios-sample-inventory-public-cutover.mjs',
  'scripts/lib/migrations/aios-sample-inventory-public-cutover-cli.mjs',
  'scripts/lib/migrations/aios-sample-inventory-public-cutover.mjs',
]);

const SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_FILES = new Set([
  '.trellis/spec/dataops/etl-and-deploy.md',
  '.trellis/spec/repo/sample-inventory-platform.md',
  'docs/API_CONTRACT_MIGRATION_GOVERNANCE.md',
  'docs/SAMPLE_INVENTORY_ARCHITECTURE.md',
  'sql/migrations/017_sample_inventory_approval_stock_deduction.sql',
  'etl/groland_postgres/tests/sql/sample_inventory_approval_stock_cutover_check.sql',
  'etl/groland_postgres/scripts/sample_inventory/test_approval_stock_cutover_postgres.sh',
  'scripts/checks/migrations/aios-sample-inventory-approval-stock-cutover.behavior.mjs',
  'scripts/checks/migrations/aios-sample-inventory-approval-stock-cutover.postgres.mjs',
  'scripts/lib/migrations/aios-ledger-free-forward-cutover-engine.mjs',
  'scripts/migrations/aios-sample-inventory-approval-stock-cutover.mjs',
  'scripts/lib/migrations/aios-sample-inventory-approval-stock-cutover-cli.mjs',
  'scripts/lib/migrations/aios-sample-inventory-approval-stock-cutover.mjs',
]);

const AGENT_CONTEXT_CUTOVER_FILES = new Set([
  'docs/API_CONTRACT_MIGRATION_GOVERNANCE.md',
  'sql/migrations/018_agent_context_governance.sql',
  'sql/migrations/019_agent_sop_candidate_governance.sql',
  'sql/migrations/020_agent_sop_asset_lifecycle.sql',
  'scripts/checks/migrations/aios-agent-context-cutover.behavior.mjs',
  'scripts/checks/migrations/aios-agent-context-cutover.postgres.mjs',
  'scripts/lib/migrations/aios-agent-context-cutover-cli.mjs',
  'scripts/lib/migrations/aios-agent-context-cutover.mjs',
  'scripts/lib/migrations/aios-ledger-free-forward-cutover-engine.mjs',
  'scripts/migrations/aios-agent-context-cutover.mjs',
]);

const TAOBAO_GOODS_FORWARD_CUTOVER_FILES = new Set([
  '.trellis/spec/dataops/etl-and-deploy.md',
  'docs/API_CONTRACT_MIGRATION_GOVERNANCE.md',
  'etl/groland_postgres/sql/migrations/20260806_1140__repair_taobao_goods_ads_column_contract.sql',
  'etl/groland_postgres/tests/sql/taobao_trade_sale_goods_daily_check.sql',
  'scripts/checks/migrations/aios-taobao-goods-forward-cutover.behavior.mjs',
  'scripts/lib/migrations/aios-ledger-free-forward-cutover-engine.mjs',
  'scripts/migrations/aios-taobao-goods-forward-cutover.mjs',
  'scripts/lib/migrations/aios-taobao-goods-forward-cutover-cli.mjs',
  'scripts/lib/migrations/aios-taobao-goods-forward-cutover.mjs',
]);

const TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_FILES = new Set([
  '.trellis/spec/dataops/etl-and-deploy.md',
  'docs/API_CONTRACT_MIGRATION_GOVERNANCE.md',
  'etl/groland_postgres/sql/migrations/20260806_1850__normalize_taobao_goods_favorite_cart_cost_metadata.sql',
  'etl/groland_postgres/sql/migrations/20260806_1900__enforce_taobao_goods_ads_schema_contract.sql',
  'etl/groland_postgres/tests/sql/taobao_trade_sale_goods_daily_schema_contract_check.sql',
  'etl/groland_postgres/scripts/test_taobao_goods_schema_contract_postgres.sh',
  'scripts/checks/migrations/aios-taobao-goods-schema-contract-forward-cutover.behavior.mjs',
  'scripts/checks/migrations/aios-taobao-goods-schema-contract.postgres.mjs',
  'scripts/lib/migrations/aios-ledger-free-forward-cutover-engine.mjs',
  'scripts/lib/migrations/aios-taobao-goods-schema-contract-forward-cutover-cli.mjs',
  'scripts/lib/migrations/aios-taobao-goods-schema-contract-forward-cutover.mjs',
  'scripts/migrations/aios-taobao-goods-schema-contract-forward-cutover.mjs',
]);

const QIANCHUAN_ALIMAMA_RUNTIME_RETIREMENT_FILES = new Set([
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-alimama-runtime-retirement-fixtures.mjs',
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe.mjs',
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-alimama-runtime-retirement-plan.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-alimama-runtime-inventory.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-alimama-runtime-replacement-readonly-probe.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-plan-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-plan.mjs',
]);

const QIANCHUAN_ALIMAMA_RUNTIME_RETIREMENT_DECISION_FILES = new Set([
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-alimama-runtime-retirement-fixtures.mjs',
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-alimama-runtime-retirement-decisions.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-decisions-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-alimama-runtime-retirement-decisions.mjs',
]);

const QIANCHUAN_P1D_FORWARD_REPAIR_DECISION_FILES = new Set([
  'scripts/checks/marketing/content-assets-qianchuan-production-migration-p1d-forward-repair-decisions.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-p1d-forward-repair-decisions-cli.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-p1d-forward-repair-decisions.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-p1d-review-decisions.mjs',
]);

const QIANCHUAN_OWNER_DECISION_SHARED_FILES = new Set([
  'scripts/lib/migrations/aios-qianchuan-production-migration-owner-decision-artifact.mjs',
  'scripts/lib/migrations/aios-qianchuan-production-migration-reviewed-overlay.mjs',
]);

export const SUPPORT_SCRIPT_AFFECTED_RULES = Object.freeze([
  {
    files: QIANCHUAN_CARD_RATIO_STAGE2_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-card-ratio-stage2-behavior',
    ),
    reason: 'Qianchuan card-ratio Stage 2 implementation change',
  },
  {
    files: QIANCHUAN_CARD_RATIO_SHARED_SQL_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-card-ratio-stage1-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-card-ratio-stage2-behavior',
    ),
    reason: 'Qianchuan card-ratio shared SQL contract change',
  },
  {
    files: QIANCHUAN_CARD_RATIO_READONLY_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-card-ratio-readonly-probe-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-card-ratio-stage1-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-card-ratio-stage2-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior',
    ),
    reason: 'Qianchuan card-ratio read-only evidence contract change',
  },
  {
    files: QIANCHUAN_INFLUENCER_TAG_NORMALIZATION_SHARED_SQL_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-readonly-probe-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-readonly-probe-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-repair-plan-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage1-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage2-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior',
    ),
    reason: 'Qianchuan influencer-tag shared normalization SQL contract change',
  },
  {
    files: QIANCHUAN_INFLUENCER_TAG_READONLY_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-readonly-probe-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-repair-plan-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage1-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage2-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior',
    ),
    reason: 'Qianchuan influencer-tag read-only evidence contract change',
  },
  {
    files: QIANCHUAN_INFLUENCER_TAG_REPAIR_PLAN_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-repair-plan-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage1-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage2-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior',
    ),
    reason: 'Qianchuan influencer-tag offline repair-plan contract change',
  },
  {
    files: QIANCHUAN_INFLUENCER_TAG_STAGE1_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage1-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage2-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior',
    ),
    reason: 'Qianchuan influencer-tag guarded Stage 1 execution change',
  },
  {
    files: QIANCHUAN_INFLUENCER_TAG_STAGE2_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage2-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior',
    ),
    reason: 'Qianchuan influencer-tag bounded Stage 2 execution change',
  },
  {
    files: QIANCHUAN_INFLUENCER_TAG_FORWARD_REPAIR_DECISION_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-influencer-tag-stage2-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior',
    ),
    reason: 'Qianchuan influencer-tag forward-repair owner-decision recorder change',
  },
  {
    files: QIANCHUAN_PARSE_HELPER_FORWARD_CONTRACT_PLAN_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-parse-helper-forward-contract-plan-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-parse-helper-readonly-probe-behavior',
    ),
    reason: 'Qianchuan parse-helper offline forward-contract plan change',
  },
  {
    files: QIANCHUAN_PARSE_HELPER_READONLY_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-parse-helper-readonly-probe-behavior',
    ),
    reason: 'Qianchuan parse-helper live read-only evidence contract change',
  },
  {
    files: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_READONLY_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-platform-video-identity-contract-plan-behavior',
    ),
    reason: 'Qianchuan platform-video identity read-only evidence contract change',
  },
  {
    files: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_CONTRACT_PLAN_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-platform-video-identity-contract-plan-behavior',
    ),
    reason: 'Qianchuan platform-video identity offline forward-contract plan change',
  },
  {
    files: QIANCHUAN_LEDGER_BOOTSTRAP_PLAN_FILES,
    gates: ciScriptGates(
      'verify:migrations:aios',
      'verify:migrations:aios-behavior',
      'verify:migrations:aios-ledger-bootstrap-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-ledger-bootstrap-plan-behavior',
    ),
    reason: 'Qianchuan offline migration ledger bootstrap plan or runner-prefix contract change',
  },
  {
    files: AIOS_OWNER_REVIEWED_OVERLAY_FILES,
    gates: ciScriptGates(
      'verify:migrations:aios',
      'verify:migrations:aios-behavior',
      'verify:migrations:aios-owner-reviewed-overlay-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-ledger-bootstrap-plan-behavior',
    ),
    reason: 'AIOS checksum-pinned migration owner-review overlay contract change',
  },
  {
    files: AIOS_LEDGER_BOOTSTRAP_WRITER_FILES,
    gates: ciScriptGates(
      'verify:migrations:aios',
      'verify:migrations:aios-behavior',
      'verify:migrations:aios-ledger-bootstrap-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-ledger-bootstrap-plan-behavior',
    ),
    reason: 'AIOS migration ledger canonical v2 schema or bootstrap writer contract change',
  },
  {
    files: SAMPLE_INVENTORY_FORWARD_CUTOVER_FILES,
    gates: ciScriptGates(
      'verify:migrations:aios',
      'verify:migrations:aios-behavior',
      'verify:migrations:aios-sample-inventory-forward-cutover-behavior',
    ),
    reason: 'Sample inventory backend-only forward cutover contract change',
  },
  {
    files: SAMPLE_INVENTORY_PUBLIC_CUTOVER_FILES,
    gates: ciScriptGates(
      'verify:migrations:aios',
      'verify:migrations:aios-behavior',
      'verify:migrations:aios-sample-inventory-public-cutover-behavior',
    ),
    reason: 'Sample inventory backend/015 public cutover contract change',
  },
  {
    files: SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_FILES,
    gates: ciScriptGates(
      'verify:migrations:aios',
      'verify:migrations:aios-behavior',
      'verify:migrations:aios-sample-inventory-approval-stock-cutover-behavior',
    ),
    reason: 'Sample inventory backend/017 approval-stock cutover contract change',
  },
  {
    files: AGENT_CONTEXT_CUTOVER_FILES,
    gates: ciScriptGates(
      'verify:migrations:aios',
      'verify:migrations:aios-behavior',
      'verify:migrations:aios-agent-context-cutover-behavior',
    ),
    reason: 'Agent backend/018-020 ledger-free atomic cutover contract change',
  },
  {
    files: TAOBAO_GOODS_FORWARD_CUTOVER_FILES,
    gates: ciScriptGates(
      'verify:migrations:aios',
      'verify:migrations:aios-behavior',
      'verify:migrations:aios-taobao-goods-forward-cutover-behavior',
    ),
    reason: 'Taobao goods ledger-independent warehouse repair forward cutover contract change',
  },
  {
    files: TAOBAO_GOODS_SCHEMA_CONTRACT_FORWARD_CUTOVER_FILES,
    gates: ciScriptGates(
      'verify:migrations:aios',
      'verify:migrations:aios-behavior',
      'verify:migrations:aios-taobao-goods-schema-contract-forward-cutover-behavior',
    ),
    reason: 'Taobao goods fail-closed runtime schema contract forward cutover change',
  },
  {
    files: QIANCHUAN_ALIMAMA_RUNTIME_RETIREMENT_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-alimama-runtime-retirement-plan-behavior',
    ),
    reason: 'Qianchuan Alimama runtime replacement or retirement evidence contract change',
  },
  {
    files: QIANCHUAN_ALIMAMA_RUNTIME_RETIREMENT_DECISION_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-alimama-runtime-retirement-plan-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior',
    ),
    reason: 'Qianchuan Alimama runtime retirement owner-decision recorder change',
  },
  {
    files: QIANCHUAN_P1D_FORWARD_REPAIR_DECISION_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior',
    ),
    reason: 'Qianchuan P1D forward-repair decision recorder change',
  },
  {
    files: QIANCHUAN_OWNER_DECISION_SHARED_FILES,
    gates: ciScriptGates(
      'verify:marketing:content-assets-qianchuan-production-migration-review-decisions-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-p1c-review-decisions-behavior',
      'verify:marketing:content-assets-qianchuan-production-migration-p1d-review-decisions-behavior',
    ),
    reason: 'Qianchuan shared owner-decision validation or overlay change',
  },
  {
    files: DEPLOY_CONFIG_HELPER_FILES,
    gates: ciScriptGates(
      'verify:deploy:dashboard-latency-systemd-behavior',
      'verify:deploy:config',
      'verify:deploy:config-behavior',
      'verify:deploy:vps-git-state:smoke',
    ),
    reason: 'deploy config helper change',
  },
  {
    files: DEPLOY_CONFIG_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates(
      'verify:deploy:dashboard-latency-systemd-behavior',
      'verify:deploy:config-behavior',
    ),
    reason: 'deploy config behavior fixture change',
  },
  {
    files: VPS_GIT_STATE_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:deploy:vps-git-state:smoke'),
    reason: 'VPS Git state behavior fixture change',
  },
  {
    files: SHELL_SYNTAX_HELPER_FILES,
    gates: ciScriptGates('verify:shell:syntax', 'verify:quality-runner:scheduler-shell'),
    reason: 'shell syntax helper change',
  },
]);

export const SHARED_GUARD_AFFECTED_RULES = Object.freeze([
  {
    files: GUARD_UTILS_BEHAVIOR_FIXTURE_FILES,
    gates: ciScriptGates('verify:ci:guard-utils-behavior'),
    reason: 'guard utils behavior fixture change',
  },
  {
    files: GATE_FIXTURE_UTILS_HELPER_FILES,
    gates: ciScriptGates(),
    reason: 'shared gate fixture helper change',
  },
  {
    files: GATE_FIXTURE_UTILS_BEHAVIOR_FIXTURE_FILES,
    gates: ['lint:scripts', 'verify:ci:gate-fixture-utils-behavior'],
    reason: 'shared gate fixture behavior fixture change',
  },
  {
    files: BEHAVIOR_GUARD_QUALITY_HELPER_FILES,
    gates: [
      ...CI_META_GATES,
      'verify:design:behavior-guard-quality',
      'verify:design:behavior-guard-quality-behavior',
      'verify:frontend:behavior-guard-quality',
      'verify:frontend:behavior-guard-quality-behavior',
      'verify:weekly:behavior-guard-quality',
      'verify:weekly:behavior-guard-quality-behavior',
    ],
    reason: 'behavior guard quality helper change',
  },
]);
