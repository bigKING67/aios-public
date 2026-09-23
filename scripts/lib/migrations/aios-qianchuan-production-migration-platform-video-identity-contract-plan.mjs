import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import {
  PLATFORM_VIDEO_IDENTITY_INDEXES,
  PLATFORM_VIDEO_IDENTITY_TARGET,
  QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION,
  validateQianchuanPlatformVideoIdentityReadonlyProbe,
} from './aios-qianchuan-production-migration-platform-video-identity-readonly-probe.mjs';

export { QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION };

const SOURCE_CONTRACTS = Object.freeze({
  historicalMigration: Object.freeze({
    path: PLATFORM_VIDEO_IDENTITY_TARGET.relativePath,
    sha256: PLATFORM_VIDEO_IDENTITY_TARGET.checksum,
  }),
  initialIndexMigration: Object.freeze({
    path: 'etl/groland_postgres/sql/migrations/20260522_1600__create_ads_marketing_content_assets.sql',
    sha256: '27bf09c02bbf18499ba9286f80b41dd0bd2ede6fdbf24d83d02575d675db2ada',
  }),
  performanceIndexMigration: Object.freeze({
    path: 'etl/groland_postgres/sql/migrations/20260525_1930__add_marketing_content_performance_indexes.sql',
    sha256: 'fb10104d07579991f0da95a8aa11d0cd36662e4314fb7d2148246eafda730597',
  }),
  identityLookup: Object.freeze({
    path: 'backend-rust/src/marketing/content_assets/identity_lookup.rs',
    sha256: '79a61a1252b1960753ff1bc32e950c74653b4223a2989671becccb77027a9707',
  }),
  identityMutations: Object.freeze({
    path: 'backend-rust/src/marketing/content_assets/identity_mutations.rs',
    sha256: 'be65821ada35812f577d0a57806facc50b4f19b32ba41c159a493ec1f7b157a8',
  }),
  yuntuArchiveRepository: Object.freeze({
    path: 'etl/groland_postgres/scripts/marketing_content_assets/yuntu_archive_repository.py',
    sha256: '0b31cb81fcbc60947648aba22094f3e923afb100b4f29ea471536a7d02b0570a',
  }),
});

const INSTALL_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_platform_videos_external_video_active
  ON ads.marketing_content_platform_videos (
    platform,
    NULLIF(BTRIM(external_video_id), '')
  )
  WHERE relation_status = 'active'
    AND NULLIF(BTRIM(external_video_id), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_content_platform_videos_item_note_active
  ON ads.marketing_content_platform_videos (
    platform,
    COALESCE(NULLIF(BTRIM(account_id), ''), ''),
    COALESCE(NULLIF(BTRIM(external_item_id), ''), ''),
    COALESCE(NULLIF(BTRIM(external_note_id), ''), '')
  )
  WHERE relation_status = 'active'
    AND NULLIF(BTRIM(external_video_id), '') IS NULL
    AND COALESCE(
      NULLIF(BTRIM(external_item_id), ''),
      NULLIF(BTRIM(external_note_id), '')
    ) IS NOT NULL;`;

const CLEANUP_SQL = `DROP INDEX IF EXISTS ads.idx_ads_mc_platform_video_identity_active;
DROP INDEX IF EXISTS ads.idx_marketing_content_platform_videos_video_active;`;

const CANONICAL_EXTERNAL_VIDEO_IDENTITY = Object.freeze([
  'platform',
  "NULLIF(BTRIM(external_video_id), '')",
]);
const CANONICAL_FALLBACK_IDENTITY = Object.freeze([
  'platform',
  "COALESCE(NULLIF(BTRIM(account_id), ''), '')",
  "COALESCE(NULLIF(BTRIM(external_item_id), ''), '')",
  "COALESCE(NULLIF(BTRIM(external_note_id), ''), '')",
]);
const RELEASE_SEQUENCE = Object.freeze([
  'repeat_precontract_readonly_probe_and_require_zero_conflicts_and_locks',
  'apply_index_only_canonical_guard_migration',
  'run_independent_postinstall_readonly_probe',
  'apply_separate_redundant_legacy_index_cleanup_migration',
  'run_independent_postcontract_readonly_probe',
  'record_owner_decision_only_after_both_postchecks',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp.`);
  }
}

function assertNonNegativeCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function sourceEvidence(source, contract, label) {
  if (typeof source !== 'string' || source.length === 0) throw new Error(`${label} source is required.`);
  const actualSha256 = sha256(source);
  if (actualSha256 !== contract.sha256) {
    throw new Error(`${label} source SHA-256 drifted from the reviewed contract.`);
  }
  return {
    path: contract.path,
    bytes: Buffer.byteLength(source),
    sha256: actualSha256,
  };
}

function assertContains(source, markers, label) {
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${label} no longer contains required marker: ${marker}`);
  }
}

function validateRepositorySemantics(sources) {
  assertContains(sources.historicalMigration, [
    'PARTITION BY pv.asset_id, pv.platform, NULLIF(BTRIM(pv.external_video_id), \'\')',
    'idx_marketing_content_platform_videos_asset_video_active',
    'UPDATE ads.marketing_content_ad_materials',
    "SET\n  relation_status = 'archived'",
  ], 'Historical platform-video migration');
  for (const [source, label] of [
    [sources.initialIndexMigration, 'Initial platform-video index migration'],
    [sources.performanceIndexMigration, 'Performance platform-video index migration'],
  ]) {
    assertContains(source, [
      "platform,\n    COALESCE(account_id, ''),\n    COALESCE(external_video_id, ''),",
      "COALESCE(external_item_id, ''),\n    COALESCE(external_note_id, '')",
    ], label);
  }
  assertContains(sources.identityLookup, [
    'find_platform_video_by_platform_external_video_id',
    'WHERE platform = $1\n          AND external_video_id = $2',
    'CASE WHEN asset_id = $3 THEN 0 ELSE 1 END ASC',
  ], 'Backend platform-video identity lookup');
  assertContains(sources.identityMutations, [
    'find_platform_video_by_platform_external_video_id(',
    '该平台视频 ID 已绑定到其他内容资产',
    'INSERT INTO ads.marketing_content_platform_videos',
  ], 'Backend platform-video mutations');
  assertContains(sources.yuntuArchiveRepository, [
    "WHERE platform = 'douyin'",
    "f\"platform-video:douyin:{claim.aweme_id}:{claim.item_id}:{claim.group_id}\"",
    'ON CONFLICT (platform_video_id) DO UPDATE SET',
  ], 'Yuntu platform-video upsert');
}

function assertSqlBoundary(sql, expectedPrefix, label) {
  const normalized = sql.replace(/--[^\n]*/gu, '').trim();
  if (!normalized.startsWith(expectedPrefix)
    || /\b(?:BEGIN|COMMIT|ROLLBACK|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CALL|COPY|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE)\b/iu.test(normalized)) {
    throw new Error(`${label} contains an unauthorized SQL statement.`);
  }
}

export function validateQianchuanPlatformVideoIdentityForwardInstallMigrationAsset({
  forwardMigrationPath,
  forwardMigrationSql,
}) {
  if (forwardMigrationPath !== QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.path) {
    throw new Error('Platform-video forward install migration path differs from the staged repository identity.');
  }
  if (typeof forwardMigrationSql !== 'string') {
    throw new Error('Platform-video forward install migration SQL is required.');
  }
  const reviewedSql = forwardMigrationSql.trimEnd();
  assertSqlBoundary(reviewedSql, 'CREATE UNIQUE INDEX', 'Platform-video forward install migration');
  if (reviewedSql !== INSTALL_SQL) {
    throw new Error('Platform-video forward install migration must preserve the exact reviewed canonical-guard SQL.');
  }
  const bytes = Buffer.byteLength(forwardMigrationSql);
  const fileSha256 = sha256(forwardMigrationSql);
  if (bytes !== QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.bytes
    || fileSha256 !== QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.sha256) {
    throw new Error('Platform-video forward install migration file SHA-256 differs from the staged contract.');
  }
  return {
    identity: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.identity,
    path: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.path,
    bytes,
    sha256: fileSha256,
    reviewedSqlSha256: sha256(INSTALL_SQL),
    indexes: [
      PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalExternalVideo,
      PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalItemNote,
    ],
  };
}

function artifactSourceMap(sources) {
  return Object.fromEntries(Object.entries(SOURCE_CONTRACTS).map(([key, contract]) => [
    key,
    sourceEvidence(sources[key], contract, key),
  ]));
}

export function buildQianchuanPlatformVideoIdentityContractPlan({
  generatedAt = new Date().toISOString(),
  probe,
  probeArtifact,
  probeSha256,
  sources,
}) {
  assertIsoTimestamp(generatedAt, 'Platform-video plan generatedAt');
  assertPinnedMigrationReviewArtifact(probeArtifact, probeSha256, 'Platform-video identity probe');
  validateQianchuanPlatformVideoIdentityReadonlyProbe(probe);
  if (!sources || typeof sources !== 'object') throw new Error('Platform-video repository sources are required.');
  validateRepositorySemantics(sources);
  const repositorySources = artifactSourceMap(sources);
  assertSqlBoundary(INSTALL_SQL, 'CREATE UNIQUE INDEX', 'Platform-video guard-install migration');
  assertSqlBoundary(CLEANUP_SQL, 'DROP INDEX', 'Platform-video legacy-index cleanup migration');
  return validateQianchuanPlatformVideoIdentityContractPlan({
    schemaVersion: 1,
    generatedAt,
    mode: 'offline_platform_video_identity_contract_plan',
    sourceArtifacts: { probe: probeArtifact },
    repositorySources,
    target: PLATFORM_VIDEO_IDENTITY_TARGET,
    authorization: {
      networkAccess: false,
      productionWritesAuthorized: false,
      migrationApplyAuthorized: false,
      dataRepairAuthorized: false,
      ownerDecisionRecorded: false,
      ledgerWritesAuthorized: false,
      deployAuthorized: false,
      arkInvoked: false,
    },
    currentEvidence: {
      activeRows: probe.summary.activeRows,
      globalVideoDuplicateGroups: probe.summary.globalVideoDuplicateGroups,
      fallbackDuplicateGroups: probe.summary.fallbackDuplicateGroups,
      orphanAdMaterialRefs: probe.summary.orphanAdMaterialRefs,
      waitingLocks: probe.summary.waitingLocks,
      legacyDefinitionsEquivalent: probe.summary.legacyDefinitionsEquivalent,
      contractState: probe.summary.contractState,
    },
    decision: {
      status: 'forward_identity_contract_ready',
      canonicalExternalVideoIdentity: CANONICAL_EXTERNAL_VIDEO_IDENTITY,
      canonicalFallbackIdentity: CANONICAL_FALLBACK_IDENTITY,
      externalVideoScope: 'global_across_assets_and_accounts',
      fallbackScope: 'account_item_note_only_when_external_video_id_is_blank',
      assetIdIsIdentityComponent: false,
      historicalMigrationReplayRecommended: false,
      dataMutationRequired: false,
    },
    migrations: {
      installCanonicalGuards: {
        kind: 'new_timestamped_index_only_forward_migration',
        sql: INSTALL_SQL,
        bytes: Buffer.byteLength(INSTALL_SQL),
        sha256: sha256(INSTALL_SQL),
        indexes: [
          PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalExternalVideo,
          PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalItemNote,
        ],
      },
      removeRedundantLegacyGuards: {
        kind: 'separate_timestamped_index_cleanup_migration',
        sql: CLEANUP_SQL,
        bytes: Buffer.byteLength(CLEANUP_SQL),
        sha256: sha256(CLEANUP_SQL),
        indexes: [
          PLATFORM_VIDEO_IDENTITY_INDEXES.legacyIdentity,
          PLATFORM_VIDEO_IDENTITY_INDEXES.legacyVideo,
        ],
      },
    },
    releaseSequence: RELEASE_SEQUENCE,
    rollback: {
      dataRestoreRequired: false,
      applicationRollbackMayLeaveCanonicalGuardsInstalled: true,
      recreateRedundantLegacyIndexesByDefault: false,
      removeCanonicalGuardsRequiresSeparateApproval: true,
      historicalDedupeReplayForbidden: true,
    },
    summary: {
      identityContractPlanReady: true,
      newIndexes: 2,
      redundantIndexesToRemove: 2,
      dataMutationRows: 0,
      requiredIndependentPostchecks: 2,
    },
  });
}

export function validateQianchuanPlatformVideoIdentityContractPlan(plan) {
  assertIsoTimestamp(plan?.generatedAt, 'Platform-video plan generatedAt');
  if (plan?.schemaVersion !== 1 || plan.mode !== 'offline_platform_video_identity_contract_plan'
    || plan.target?.identity !== PLATFORM_VIDEO_IDENTITY_TARGET.identity
    || plan.target?.checksum !== PLATFORM_VIDEO_IDENTITY_TARGET.checksum
    || plan.authorization?.networkAccess !== false
    || plan.authorization?.productionWritesAuthorized !== false
    || plan.authorization?.migrationApplyAuthorized !== false
    || plan.authorization?.dataRepairAuthorized !== false
    || plan.authorization?.ownerDecisionRecorded !== false
    || plan.authorization?.ledgerWritesAuthorized !== false
    || plan.authorization?.deployAuthorized !== false
    || plan.authorization?.arkInvoked !== false) {
    throw new Error('Platform-video identity contract plan policy or target is invalid.');
  }
  assertPinnedMigrationReviewArtifact(plan.sourceArtifacts?.probe, plan.sourceArtifacts?.probe?.sha256, 'Platform-video plan probe');
  for (const [key, contract] of Object.entries(SOURCE_CONTRACTS)) {
    const source = plan.repositorySources?.[key];
    if (source?.path !== contract.path || source?.sha256 !== contract.sha256
      || !Number.isSafeInteger(source?.bytes) || source.bytes < 1) {
      throw new Error(`Platform-video plan source ${key} is invalid.`);
    }
  }
  for (const [label, value] of Object.entries({
    activeRows: plan.currentEvidence?.activeRows,
    orphanAdMaterialRefs: plan.currentEvidence?.orphanAdMaterialRefs,
  })) assertNonNegativeCount(value, label);
  if (plan.currentEvidence?.globalVideoDuplicateGroups !== 0
    || plan.currentEvidence?.fallbackDuplicateGroups !== 0
    || plan.currentEvidence?.waitingLocks !== 0
    || plan.currentEvidence?.legacyDefinitionsEquivalent !== true
    || plan.currentEvidence?.contractState !== 'legacy_redundant'
    || plan.decision?.status !== 'forward_identity_contract_ready'
    || JSON.stringify(plan.decision?.canonicalExternalVideoIdentity) !== JSON.stringify(CANONICAL_EXTERNAL_VIDEO_IDENTITY)
    || JSON.stringify(plan.decision?.canonicalFallbackIdentity) !== JSON.stringify(CANONICAL_FALLBACK_IDENTITY)
    || plan.decision?.externalVideoScope !== 'global_across_assets_and_accounts'
    || plan.decision?.fallbackScope !== 'account_item_note_only_when_external_video_id_is_blank'
    || plan.decision?.assetIdIsIdentityComponent !== false
    || plan.decision?.historicalMigrationReplayRecommended !== false
    || plan.decision?.dataMutationRequired !== false) {
    throw new Error('Platform-video identity decision is not supported by the pinned evidence.');
  }
  const install = plan.migrations?.installCanonicalGuards;
  const cleanup = plan.migrations?.removeRedundantLegacyGuards;
  assertSqlBoundary(install?.sql ?? '', 'CREATE UNIQUE INDEX', 'Platform-video guard-install migration');
  assertSqlBoundary(cleanup?.sql ?? '', 'DROP INDEX', 'Platform-video cleanup migration');
  for (const [migration, sql, label] of [
    [install, INSTALL_SQL, 'install'],
    [cleanup, CLEANUP_SQL, 'cleanup'],
  ]) {
    if (migration?.bytes !== Buffer.byteLength(sql) || migration?.sha256 !== sha256(sql)
      || migration?.sql !== sql) {
      throw new Error(`Platform-video ${label} migration evidence is invalid.`);
    }
  }
  if (JSON.stringify(install?.indexes) !== JSON.stringify([
    PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalExternalVideo,
    PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalItemNote,
  ])
    || JSON.stringify(cleanup?.indexes) !== JSON.stringify([
      PLATFORM_VIDEO_IDENTITY_INDEXES.legacyIdentity,
      PLATFORM_VIDEO_IDENTITY_INDEXES.legacyVideo,
    ])
    || JSON.stringify(plan.releaseSequence) !== JSON.stringify(RELEASE_SEQUENCE)
    || plan.summary?.identityContractPlanReady !== true
    || plan.summary?.newIndexes !== 2
    || plan.summary?.redundantIndexesToRemove !== 2
    || plan.summary?.dataMutationRows !== 0
    || plan.summary?.requiredIndependentPostchecks !== 2
    || plan.rollback?.dataRestoreRequired !== false
    || plan.rollback?.applicationRollbackMayLeaveCanonicalGuardsInstalled !== true
    || plan.rollback?.recreateRedundantLegacyIndexesByDefault !== false
    || plan.rollback?.removeCanonicalGuardsRequiresSeparateApproval !== true
    || plan.rollback?.historicalDedupeReplayForbidden !== true) {
    throw new Error('Platform-video identity release or rollback contract is invalid.');
  }
  return plan;
}
