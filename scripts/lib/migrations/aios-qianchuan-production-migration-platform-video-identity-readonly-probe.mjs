import { createHash } from 'node:crypto';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';

export const PLATFORM_VIDEO_IDENTITY_TARGET = Object.freeze({
  checksum: '572dbc25d198cf81276866b7e2f877d258ce940a8c06b974f467527ff52d3d5e',
  identity: 'warehouse/20260617_1900',
  relativePath: 'etl/groland_postgres/sql/migrations/20260617_1900__dedupe_marketing_content_platform_video_identities.sql',
});
export const PLATFORM_VIDEO_IDENTITY_INDEXES = Object.freeze({
  canonicalExternalVideo: 'ads.idx_marketing_content_platform_videos_external_video_active',
  canonicalItemNote: 'ads.idx_marketing_content_platform_videos_item_note_active',
  historicalAssetVideo: 'ads.idx_marketing_content_platform_videos_asset_video_active',
  legacyIdentity: 'ads.idx_ads_mc_platform_video_identity_active',
  legacyVideo: 'ads.idx_marketing_content_platform_videos_video_active',
});
export const QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION = Object.freeze({
  bytes: 812,
  identity: 'warehouse/20260726_1000',
  path: 'etl/groland_postgres/sql/migrations/20260726_1000__enforce_marketing_content_platform_video_identity.sql',
  reviewedSqlSha256: '80ea57a6a09b24983ec4f5b98abd9ef105ba430db67f7885b18ad859d8279e5d',
  sha256: '8c8d10ffb804a6aacfb45a33715c717ad134e659ed2874464d093ac8962dcfc6',
});

const RELATION = 'ads.marketing_content_platform_videos';
const CONFLICT_CAPTURE_LIMIT = 200;
const INDEX_IDENTITIES = Object.freeze(Object.values(PLATFORM_VIDEO_IDENTITY_INDEXES));

const TABLE_STATS_SQL = `/* aios_qianchuan_platform_video_identity:table_stats */
SELECT
  requested.qualified_name,
  relation.oid::TEXT AS oid,
  relation.relkind::TEXT AS relation_kind,
  CASE WHEN relation.oid IS NULL THEN NULL ELSE pg_relation_size(relation.oid)::TEXT END AS heap_bytes,
  CASE WHEN relation.oid IS NULL THEN NULL ELSE pg_indexes_size(relation.oid)::TEXT END AS index_bytes,
  CASE WHEN relation.oid IS NULL THEN NULL ELSE pg_total_relation_size(relation.oid)::TEXT END AS total_bytes,
  stats.n_live_tup::TEXT AS estimated_live_rows,
  stats.n_dead_tup::TEXT AS estimated_dead_rows,
  COALESCE(locks.granted_locks, 0)::TEXT AS granted_locks,
  COALESCE(locks.waiting_locks, 0)::TEXT AS waiting_locks
FROM (VALUES ($1::TEXT)) AS requested(qualified_name)
LEFT JOIN pg_class relation ON relation.oid = to_regclass(requested.qualified_name)
LEFT JOIN pg_stat_user_tables stats ON stats.relid = relation.oid
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE lock.granted)::BIGINT AS granted_locks,
    COUNT(*) FILTER (WHERE NOT lock.granted)::BIGINT AS waiting_locks
  FROM pg_locks lock
  WHERE lock.relation = relation.oid
) locks ON TRUE`;

const INDEXES_SQL = `/* aios_qianchuan_platform_video_identity:indexes */
SELECT
  requested.identity,
  index_relation.oid::TEXT AS oid,
  table_relation.oid::regclass::TEXT AS table_name,
  index_record.indisunique AS is_unique,
  index_record.indisvalid AS is_valid,
  index_record.indisready AS is_ready,
  CASE WHEN index_relation.oid IS NULL THEN NULL ELSE pg_get_indexdef(index_relation.oid) END AS definition,
  CASE WHEN index_relation.oid IS NULL THEN NULL ELSE pg_relation_size(index_relation.oid)::TEXT END AS index_bytes,
  COALESCE(stats.idx_scan, 0)::TEXT AS index_scans
FROM unnest($1::TEXT[]) WITH ORDINALITY AS requested(identity, position)
LEFT JOIN pg_class index_relation ON index_relation.oid = to_regclass(requested.identity)
LEFT JOIN pg_index index_record ON index_record.indexrelid = index_relation.oid
LEFT JOIN pg_class table_relation ON table_relation.oid = index_record.indrelid
LEFT JOIN pg_stat_user_indexes stats ON stats.indexrelid = index_relation.oid
ORDER BY requested.position`;

const FOREIGN_KEYS_SQL = `/* aios_qianchuan_platform_video_identity:foreign_keys */
SELECT
  constraint_record.conname AS constraint_name,
  constraint_record.conrelid::regclass::TEXT AS source_relation,
  pg_get_constraintdef(constraint_record.oid, TRUE) AS definition
FROM pg_constraint constraint_record
WHERE constraint_record.confrelid = to_regclass($1)
  AND constraint_record.contype = 'f'
ORDER BY constraint_record.conrelid::regclass::TEXT, constraint_record.conname`;

const IDENTITY_SUMMARY_SQL = `/* aios_qianchuan_platform_video_identity:identity_summary */
WITH active AS (
  SELECT
    platform_video_id,
    asset_id,
    BTRIM(platform) AS platform,
    NULLIF(BTRIM(account_id), '') AS account_id,
    NULLIF(BTRIM(external_video_id), '') AS external_video_id,
    NULLIF(BTRIM(external_item_id), '') AS external_item_id,
    NULLIF(BTRIM(external_note_id), '') AS external_note_id
  FROM ads.marketing_content_platform_videos
  WHERE relation_status = 'active'
),
global_video_groups AS (
  SELECT
    platform,
    external_video_id,
    COUNT(*) AS rows,
    COUNT(DISTINCT asset_id) AS assets,
    COUNT(DISTINCT account_id) FILTER (WHERE account_id IS NOT NULL) AS accounts
  FROM active
  WHERE external_video_id IS NOT NULL
  GROUP BY platform, external_video_id
),
same_asset_video_groups AS (
  SELECT asset_id, platform, external_video_id, COUNT(*) AS rows
  FROM active
  WHERE external_video_id IS NOT NULL
  GROUP BY asset_id, platform, external_video_id
),
fallback_groups AS (
  SELECT
    platform,
    COALESCE(account_id, '') AS account_id,
    COALESCE(external_item_id, '') AS external_item_id,
    COALESCE(external_note_id, '') AS external_note_id,
    COUNT(*) AS rows
  FROM active
  WHERE external_video_id IS NULL
    AND COALESCE(external_item_id, external_note_id) IS NOT NULL
  GROUP BY platform, COALESCE(account_id, ''), COALESCE(external_item_id, ''), COALESCE(external_note_id, '')
),
legacy_tuple_groups AS (
  SELECT
    platform,
    COALESCE(account_id, '') AS account_id,
    COALESCE(external_video_id, '') AS external_video_id,
    COALESCE(external_item_id, '') AS external_item_id,
    COALESCE(external_note_id, '') AS external_note_id,
    COUNT(*) AS rows
  FROM active
  WHERE COALESCE(external_video_id, external_item_id, external_note_id) IS NOT NULL
  GROUP BY platform, COALESCE(account_id, ''), COALESCE(external_video_id, ''),
    COALESCE(external_item_id, ''), COALESCE(external_note_id, '')
)
SELECT
  (SELECT COUNT(*) FROM ads.marketing_content_platform_videos)::TEXT AS rows,
  (SELECT COUNT(*) FROM active)::TEXT AS active_rows,
  (SELECT COUNT(*) FROM active WHERE external_video_id IS NOT NULL)::TEXT AS external_video_rows,
  (SELECT COUNT(*) FROM active WHERE external_video_id IS NULL
    AND COALESCE(external_item_id, external_note_id) IS NOT NULL)::TEXT AS fallback_rows,
  (SELECT COUNT(*) FROM active WHERE external_video_id IS NULL
    AND external_item_id IS NULL AND external_note_id IS NULL)::TEXT AS blank_identity_rows,
  (SELECT COUNT(*) FROM global_video_groups WHERE rows > 1)::TEXT AS global_video_duplicate_groups,
  (SELECT COALESCE(SUM(rows - 1), 0) FROM global_video_groups WHERE rows > 1)::TEXT AS global_video_duplicate_rows,
  (SELECT COUNT(*) FROM global_video_groups WHERE assets > 1)::TEXT AS global_video_cross_asset_groups,
  (SELECT COUNT(*) FROM global_video_groups WHERE accounts > 1)::TEXT AS global_video_cross_account_groups,
  (SELECT COUNT(*) FROM same_asset_video_groups WHERE rows > 1)::TEXT AS same_asset_video_duplicate_groups,
  (SELECT COALESCE(SUM(rows - 1), 0) FROM same_asset_video_groups WHERE rows > 1)::TEXT AS same_asset_video_duplicate_rows,
  (SELECT COUNT(*) FROM fallback_groups WHERE rows > 1)::TEXT AS fallback_duplicate_groups,
  (SELECT COALESCE(SUM(rows - 1), 0) FROM fallback_groups WHERE rows > 1)::TEXT AS fallback_duplicate_rows,
  (SELECT COUNT(*) FROM legacy_tuple_groups WHERE rows > 1)::TEXT AS legacy_tuple_duplicate_groups,
  (SELECT COALESCE(SUM(rows - 1), 0) FROM legacy_tuple_groups WHERE rows > 1)::TEXT AS legacy_tuple_duplicate_rows,
  (SELECT COUNT(*) FROM ads.marketing_content_ad_materials
    WHERE relation_status = 'active' AND platform_video_id IS NOT NULL)::TEXT AS active_ad_material_refs,
  (SELECT COUNT(*)
    FROM ads.marketing_content_ad_materials material
    LEFT JOIN ads.marketing_content_platform_videos video
      ON video.platform_video_id = material.platform_video_id
     AND video.relation_status = 'active'
    WHERE material.relation_status = 'active'
      AND material.platform_video_id IS NOT NULL
      AND video.platform_video_id IS NULL)::TEXT AS orphan_ad_material_refs`;

const CONFLICT_ROWS_SQL = `/* aios_qianchuan_platform_video_identity:conflict_rows */
WITH candidates AS (
  SELECT
    platform_video_id,
    asset_id,
    BTRIM(platform) AS platform,
    NULLIF(BTRIM(account_id), '') AS account_id,
    NULLIF(BTRIM(external_video_id), '') AS external_video_id,
    NULLIF(BTRIM(external_item_id), '') AS external_item_id,
    NULLIF(BTRIM(external_note_id), '') AS external_note_id,
    CASE WHEN NULLIF(BTRIM(external_video_id), '') IS NOT NULL
      THEN 'external_video' ELSE 'item_note_fallback' END AS identity_kind
  FROM ads.marketing_content_platform_videos
  WHERE relation_status = 'active'
    AND COALESCE(
      NULLIF(BTRIM(external_video_id), ''),
      NULLIF(BTRIM(external_item_id), ''),
      NULLIF(BTRIM(external_note_id), '')
    ) IS NOT NULL
),
ranked AS (
  SELECT
    candidates.*,
    CASE WHEN identity_kind = 'external_video'
      THEN COUNT(*) OVER (PARTITION BY platform, external_video_id)
      ELSE COUNT(*) OVER (
        PARTITION BY platform, COALESCE(account_id, ''),
          COALESCE(external_item_id, ''), COALESCE(external_note_id, '')
      ) END AS identity_rows
  FROM candidates
)
SELECT
  identity_kind,
  platform_video_id::TEXT,
  asset_id::TEXT,
  platform,
  account_id,
  external_video_id,
  external_item_id,
  external_note_id,
  identity_rows::TEXT
FROM ranked
WHERE identity_rows > 1
ORDER BY identity_kind, platform, external_video_id, external_item_id, external_note_id,
  asset_id, platform_video_id
LIMIT $1`;

function asCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

function normalizeStatementTimeout(value) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 120000) {
    throw new Error('statementTimeoutMs must be between 1000 and 120000.');
  }
  return Math.trunc(timeout);
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp.`);
  }
}

function camelRow(row) {
  return Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase()),
    value,
  ]));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeIndexDefinition(value) {
  return String(value ?? '')
    .replace(/^CREATE UNIQUE INDEX\s+\S+\s+ON\s+/iu, 'CREATE UNIQUE INDEX ON ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function indexEvidence(row) {
  const definition = row?.definition ?? null;
  return {
    identity: row?.identity,
    present: row?.oid != null,
    tableName: row?.table_name ?? null,
    isUnique: row?.is_unique ?? null,
    isValid: row?.is_valid ?? null,
    isReady: row?.is_ready ?? null,
    indexBytes: row?.index_bytes ?? null,
    indexScans: row?.index_scans ?? null,
    definitionBytes: definition == null ? null : Buffer.byteLength(definition),
    definitionSha256: definition == null ? null : sha256(definition),
    definition,
  };
}

function validateSources(p1Packet, p1Artifact, p1Sha256, p1dProbe, p1dProbeArtifact, p1dProbeSha256) {
  assertPinnedMigrationReviewArtifact(p1Artifact, p1Sha256, 'Reviewed P1 overlay');
  assertPinnedMigrationReviewArtifact(p1dProbeArtifact, p1dProbeSha256, 'P1D owner-review probe');
  const p1Entries = Array.isArray(p1Packet?.entries) ? p1Packet.entries : [];
  const p1dEntries = p1Entries.filter((entry) => entry?.reviewWaveLabel === 'P1D');
  const p1dBoundary = p1Packet?.summary?.byWave?.P1D;
  const p1dEntriesUnresolved = p1dEntries.every((entry) => (
    entry?.authoritativeClassification === 'unknown'
    && entry?.review?.decision === null
    && entry?.review?.reviewer === null
  ));
  if (p1Packet?.mode !== 'offline_readonly_reviewed_p1_overlay'
    || p1Packet.policy?.productionWritesAuthorized !== false
    || p1Packet.policy?.ledgerWritesAuthorized !== false
    || !Number.isSafeInteger(p1dBoundary) || p1dBoundary < 1
    || p1dBoundary !== p1dEntries.length || !p1dEntriesUnresolved) {
    throw new Error('Platform-video identity probe requires a self-consistent unresolved P1D boundary.');
  }
  const entry = p1Entries.find((value) => `${value.namespace}/${value.version}` === PLATFORM_VIDEO_IDENTITY_TARGET.identity);
  const missingEffect = entry?.effects?.unsatisfiedCurrentEffects?.[0];
  const unsupportedSignals = new Set(entry?.unsupportedSignals ?? []);
  if (!entry || entry.checksum !== PLATFORM_VIDEO_IDENTITY_TARGET.checksum
    || entry.relativePath !== PLATFORM_VIDEO_IDENTITY_TARGET.relativePath
    || entry.authoritativeClassification !== 'unknown' || entry.reviewWaveLabel !== 'P1D'
    || entry.review?.decision !== null || entry.review?.reviewer !== null
    || entry.effects?.satisfied !== 0 || entry.effects?.unsatisfied !== 1
    || entry.effects?.unsatisfiedCurrentEffects?.length !== 1
    || missingEffect?.key !== `index:${PLATFORM_VIDEO_IDENTITY_INDEXES.historicalAssetVideo}`
    || missingEffect?.present !== false || missingEffect?.expectedPresent !== true
    || !unsupportedSignals.has('dml_or_backfill') || !unsupportedSignals.has('unsupported_ddl')) {
    throw new Error(`${PLATFORM_VIDEO_IDENTITY_TARGET.identity} no longer matches the unresolved identity boundary.`);
  }
  if (p1dProbe?.mode !== 'live_readonly_p1d_owner_review_probe'
    && p1dProbe?.mode !== 'live_readonly_p1d_catalog_data_shape_probe') {
    throw new Error('Platform-video identity probe requires a live read-only P1D evidence artifact.');
  }
  if (p1dProbe.policy?.productionWritesAuthorized !== false
    || p1dProbe.policy?.ledgerWritesAuthorized !== false
    || p1dProbe.policy?.ownerDecisionRecorded !== false
    || p1dProbe.policy?.deployAuthorized !== false
    || p1dProbe.policy?.arkInvoked !== false) {
    throw new Error('Pinned P1D evidence has an invalid authorization boundary.');
  }
  const probeEntry = p1dProbe.entryEvidence?.find((value) => value.family === 'platform_video_identity_dedupe');
  if (!probeEntry || probeEntry.evidenceState !== 'clean_current_data_without_exact_unique_guard'
    || probeEntry.decision !== null || probeEntry.reviewer !== null
    || JSON.stringify(probeEntry.entries) !== JSON.stringify([PLATFORM_VIDEO_IDENTITY_TARGET.identity])
    || asCount(p1dProbe.dataShapes?.platformVideo?.duplicateGroups, 'Prior same-asset duplicate groups') !== 0) {
    throw new Error('Pinned P1D evidence no longer proves the unresolved platform-video identity boundary.');
  }
  return entry;
}

export function validateQianchuanPlatformVideoIdentityProbeSources({
  p1Artifact,
  p1Packet,
  p1Sha256,
  p1dProbe,
  p1dProbeArtifact,
  p1dProbeSha256,
}) {
  return validateSources(
    p1Packet,
    p1Artifact,
    p1Sha256,
    p1dProbe,
    p1dProbeArtifact,
    p1dProbeSha256,
  );
}

function validateForwardInstallMigrationEvidence(evidence) {
  if (evidence?.bytes !== QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.bytes
    || evidence.sha256 !== QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.sha256
    || evidence.identity !== QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.identity
    || evidence.path !== QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.path
    || evidence.reviewedSqlSha256 !== QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.reviewedSqlSha256
    || JSON.stringify(evidence.indexes) !== JSON.stringify([
      PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalExternalVideo,
      PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalItemNote,
    ])) {
    throw new Error('Platform-video forward install migration evidence is invalid.');
  }
  return evidence;
}

function relevantIndexMap(indexes) {
  return new Map(indexes.map((value) => [value.identity, value]));
}

function indexIsUsable(index) {
  return index?.present === true
    && index.tableName === RELATION
    && index.isUnique === true
    && index.isValid === true
    && index.isReady === true
    && typeof index.definition === 'string'
    && index.definition.length > 0;
}

function indexDefinitionContains(index, required, forbidden = []) {
  const definition = normalizeIndexDefinition(index?.definition);
  return required.every((needle) => definition.includes(needle))
    && forbidden.every((needle) => !definition.includes(needle));
}

function legacyIndexMatchesContract(index) {
  return indexIsUsable(index) && indexDefinitionContains(index, [
    'on ads.marketing_content_platform_videos',
    'coalesce(account_id,',
    'coalesce(external_video_id,',
    'coalesce(external_item_id,',
    'coalesce(external_note_id,',
    "relation_status = 'active'",
    'nullif(external_video_id,',
    'nullif(external_item_id,',
    'nullif(external_note_id,',
  ], ['asset_id']);
}

function canonicalExternalVideoIndexMatchesContract(index) {
  return indexIsUsable(index) && indexDefinitionContains(index, [
    'on ads.marketing_content_platform_videos',
    'nullif(btrim(external_video_id)',
    "relation_status = 'active'",
    'is not null',
  ], ['asset_id', 'account_id', 'external_item_id', 'external_note_id']);
}

function canonicalItemNoteIndexMatchesContract(index) {
  return indexIsUsable(index) && indexDefinitionContains(index, [
    'on ads.marketing_content_platform_videos',
    'coalesce(nullif(btrim(account_id)',
    'coalesce(nullif(btrim(external_item_id)',
    'coalesce(nullif(btrim(external_note_id)',
    "relation_status = 'active'",
    'nullif(btrim(external_video_id)',
    'is null',
    'is not null',
  ], ['asset_id']);
}

function contractState(indexes) {
  const byIdentity = relevantIndexMap(indexes);
  const canonicalPresent = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalExternalVideo)?.present === true
    && byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalItemNote)?.present === true;
  const legacyPresent = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.legacyIdentity)?.present === true
    || byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.legacyVideo)?.present === true;
  if (canonicalPresent && legacyPresent) return 'canonical_and_legacy_parallel';
  if (canonicalPresent) return 'canonical_only';
  if (legacyPresent) return 'legacy_redundant';
  return 'missing_identity_guards';
}

function validateProbe(probe, expectedState) {
  assertIsoTimestamp(probe?.generatedAt, 'Platform-video identity probe generatedAt');
  if (probe?.schemaVersion !== 1 || probe.mode !== 'live_readonly_platform_video_identity_probe'
    || probe.policy?.transaction !== 'BEGIN READ ONLY / ROLLBACK'
    || !Number.isSafeInteger(probe.policy?.statementTimeoutMs)
    || probe.policy.statementTimeoutMs < 1000 || probe.policy.statementTimeoutMs > 120000
    || probe.policy?.networkAccess !== true
    || probe.policy?.productionWritesAuthorized !== false
    || probe.policy?.ledgerWritesAuthorized !== false
    || probe.policy?.ownerDecisionRecorded !== false
    || probe.policy?.deployAuthorized !== false
    || probe.policy?.arkInvoked !== false
    || probe.target?.identity !== PLATFORM_VIDEO_IDENTITY_TARGET.identity
    || probe.target?.checksum !== PLATFORM_VIDEO_IDENTITY_TARGET.checksum
    || probe.target?.relativePath !== PLATFORM_VIDEO_IDENTITY_TARGET.relativePath) {
    throw new Error('Platform-video identity probe policy or target is invalid.');
  }
  const expectedSourceArtifacts = expectedState === 'precontract'
    ? ['p1', 'p1dProbe']
    : ['forwardInstallMigration', 'p1', 'p1dProbe'];
  if (JSON.stringify(Object.keys(probe.sourceArtifacts ?? {}).sort()) !== JSON.stringify(expectedSourceArtifacts)) {
    throw new Error('Platform-video identity probe source artifacts are incomplete.');
  }
  for (const label of ['p1', 'p1dProbe']) {
    const artifact = probe.sourceArtifacts[label];
    assertPinnedMigrationReviewArtifact(artifact, artifact?.sha256, `Platform-video ${label} artifact`);
  }
  if (expectedState !== 'precontract') {
    validateForwardInstallMigrationEvidence(probe.sourceArtifacts.forwardInstallMigration);
  }
  const summary = probe.summary ?? {};
  for (const [label, value] of Object.entries({
    activeRows: summary.activeRows,
    globalVideoDuplicateGroups: summary.globalVideoDuplicateGroups,
    globalVideoDuplicateRows: summary.globalVideoDuplicateRows,
    fallbackDuplicateGroups: summary.fallbackDuplicateGroups,
    fallbackDuplicateRows: summary.fallbackDuplicateRows,
    waitingLocks: summary.waitingLocks,
  })) asCount(value, label);
  if (summary.contractState !== contractState(probe.catalog?.indexes ?? [])) {
    throw new Error('Platform-video identity contract state is inconsistent with index evidence.');
  }
  if (probe.conflicts?.captureLimit !== CONFLICT_CAPTURE_LIMIT
    || probe.conflicts?.capturedRows !== probe.conflicts?.rows?.length
    || probe.conflicts?.capturedRows > CONFLICT_CAPTURE_LIMIT
    || probe.conflicts?.rowsSha256 !== sha256(JSON.stringify(probe.conflicts?.rows ?? []))) {
    throw new Error('Platform-video identity conflict evidence is inconsistent.');
  }
  const noConflicts = asCount(summary.globalVideoDuplicateGroups, 'Global duplicate groups') === 0
    && asCount(summary.fallbackDuplicateGroups, 'Fallback duplicate groups') === 0;
  const byIdentity = relevantIndexMap(probe.catalog.indexes);
  const tablePresent = probe.catalog?.table?.qualifiedName === RELATION
    && probe.catalog.table.oid != null
    && ['p', 'r'].includes(probe.catalog?.table?.relationKind);
  const historicalAbsent = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.historicalAssetVideo)?.present === false;
  const firstLegacy = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.legacyIdentity);
  const secondLegacy = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.legacyVideo);
  const legacyUsable = legacyIndexMatchesContract(firstLegacy) && legacyIndexMatchesContract(secondLegacy);
  const legacyDefinitionsEquivalent = firstLegacy?.present === true && secondLegacy?.present === true
    && normalizeIndexDefinition(firstLegacy.definition) === normalizeIndexDefinition(secondLegacy.definition);
  if (summary.legacyDefinitionsEquivalent !== legacyDefinitionsEquivalent) {
    throw new Error('Platform-video legacy index equivalence is inconsistent with catalog evidence.');
  }
  const canonicalExternalVideo = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalExternalVideo);
  const canonicalItemNote = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalItemNote);
  const canonicalAbsent = canonicalExternalVideo?.present === false && canonicalItemNote?.present === false;
  const canonicalUsable = canonicalExternalVideoIndexMatchesContract(canonicalExternalVideo)
    && canonicalItemNoteIndexMatchesContract(canonicalItemNote);
  const legacyAbsent = firstLegacy?.present === false && secondLegacy?.present === false;
  const waitingLocks = asCount(summary.waitingLocks, 'Waiting locks');
  const expectedReadiness = {
    identityContractPlanReady: tablePresent && historicalAbsent && legacyUsable
      && summary.contractState === 'legacy_redundant' && legacyDefinitionsEquivalent
      && canonicalAbsent && noConflicts && waitingLocks === 0,
    postinstallReady: tablePresent && canonicalUsable && noConflicts && waitingLocks === 0,
    postcontractReady: tablePresent && summary.contractState === 'canonical_only'
      && canonicalUsable && legacyAbsent && noConflicts && waitingLocks === 0,
  };
  for (const [field, expected] of Object.entries(expectedReadiness)) {
    if (summary[field] !== expected) {
      throw new Error(`Platform-video ${field} is inconsistent with catalog/data evidence.`);
    }
  }
  for (const [summaryField, dataShapeField] of Object.entries({
    activeRows: 'activeRows',
    globalVideoDuplicateGroups: 'globalVideoDuplicateGroups',
    globalVideoDuplicateRows: 'globalVideoDuplicateRows',
    fallbackDuplicateGroups: 'fallbackDuplicateGroups',
    fallbackDuplicateRows: 'fallbackDuplicateRows',
    orphanAdMaterialRefs: 'orphanAdMaterialRefs',
  })) {
    if (summary[summaryField] !== asCount(probe.dataShape?.[dataShapeField], dataShapeField)) {
      throw new Error(`Platform-video ${summaryField} is inconsistent with data-shape evidence.`);
    }
  }
  if (waitingLocks !== asCount(probe.catalog.table.waitingLocks, 'Table waiting locks')) {
    throw new Error('Platform-video waiting-lock summary is inconsistent with table evidence.');
  }
  if (expectedState === 'precontract') {
    if (!tablePresent || !historicalAbsent || !legacyUsable
      || summary.contractState !== 'legacy_redundant' || !legacyDefinitionsEquivalent
      || !canonicalAbsent || !noConflicts || waitingLocks !== 0
      || summary.identityContractPlanReady !== true) {
      throw new Error('Platform-video precontract evidence is not ready for an identity plan.');
    }
  } else if (expectedState === 'postinstall') {
    if (!tablePresent || !canonicalUsable || !noConflicts
      || waitingLocks !== 0 || summary.postinstallReady !== true) {
      throw new Error('Platform-video postinstall evidence is incomplete.');
    }
  } else if (expectedState === 'postcontract') {
    if (!tablePresent || summary.contractState !== 'canonical_only' || !canonicalUsable || !legacyAbsent
      || !noConflicts || waitingLocks !== 0
      || summary.postcontractReady !== true) {
      throw new Error('Platform-video postcontract evidence is incomplete.');
    }
  } else {
    throw new Error(`Unsupported platform-video identity probe state: ${expectedState}.`);
  }
  return probe;
}

export async function runQianchuanPlatformVideoIdentityReadonlyProbe({
  client,
  now = () => new Date(),
  p1Artifact,
  p1Packet,
  p1Sha256,
  p1dProbe,
  p1dProbeArtifact,
  p1dProbeSha256,
  forwardInstallMigration = null,
  state = 'precontract',
  statementTimeoutMs = 30000,
}) {
  if (!['precontract', 'postinstall', 'postcontract'].includes(state)) {
    throw new Error(`Unsupported platform-video identity probe state: ${state}.`);
  }
  const normalizedStatementTimeoutMs = normalizeStatementTimeout(statementTimeoutMs);
  const targetEntry = validateQianchuanPlatformVideoIdentityProbeSources({
    p1Artifact,
    p1Packet,
    p1Sha256,
    p1dProbe,
    p1dProbeArtifact,
    p1dProbeSha256,
  });
  if (state !== 'precontract') validateForwardInstallMigrationEvidence(forwardInstallMigration);
  const result = await withAiosReadOnlyTransaction(client, {
    statementTimeoutMs: normalizedStatementTimeoutMs,
  }, async () => {
    const table = camelRow((await client.query(TABLE_STATS_SQL, [RELATION])).rows[0]);
    const indexes = (await client.query(INDEXES_SQL, [INDEX_IDENTITIES])).rows.map(indexEvidence);
    const foreignKeys = (await client.query(FOREIGN_KEYS_SQL, [RELATION])).rows.map(camelRow);
    const dataShape = camelRow((await client.query(IDENTITY_SUMMARY_SQL)).rows[0]);
    const conflictRows = (await client.query(CONFLICT_ROWS_SQL, [CONFLICT_CAPTURE_LIMIT])).rows.map(camelRow);
    const byIdentity = relevantIndexMap(indexes);
    const firstLegacy = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.legacyIdentity);
    const secondLegacy = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.legacyVideo);
    const legacyDefinitionsEquivalent = firstLegacy?.present === true && secondLegacy?.present === true
      && normalizeIndexDefinition(firstLegacy.definition) === normalizeIndexDefinition(secondLegacy.definition);
    const currentContractState = contractState(indexes);
    const noConflicts = asCount(dataShape.globalVideoDuplicateGroups, 'Global duplicate groups') === 0
      && asCount(dataShape.fallbackDuplicateGroups, 'Fallback duplicate groups') === 0;
    const canonicalExternalVideo = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalExternalVideo);
    const canonicalItemNote = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalItemNote);
    const canonicalPresent = canonicalExternalVideo?.present === true && canonicalItemNote?.present === true;
    const canonicalUsable = canonicalExternalVideoIndexMatchesContract(canonicalExternalVideo)
      && canonicalItemNoteIndexMatchesContract(canonicalItemNote);
    const legacyAbsent = firstLegacy?.present === false && secondLegacy?.present === false;
    const legacyUsable = legacyIndexMatchesContract(firstLegacy) && legacyIndexMatchesContract(secondLegacy);
    const historicalAbsent = byIdentity.get(PLATFORM_VIDEO_IDENTITY_INDEXES.historicalAssetVideo)?.present === false;
    const tablePresent = table.qualifiedName === RELATION && table.oid != null
      && ['p', 'r'].includes(table.relationKind);
    const waitingLocks = asCount(table.waitingLocks, 'Waiting locks');
    return {
      schemaVersion: 1,
      generatedAt: now().toISOString(),
      mode: 'live_readonly_platform_video_identity_probe',
      policy: {
        transaction: 'BEGIN READ ONLY / ROLLBACK',
        statementTimeoutMs: normalizedStatementTimeoutMs,
        networkAccess: true,
        productionWritesAuthorized: false,
        ledgerWritesAuthorized: false,
        ownerDecisionRecorded: false,
        deployAuthorized: false,
        arkInvoked: false,
      },
      sourceArtifacts: {
        p1: p1Artifact,
        p1dProbe: p1dProbeArtifact,
        ...(state === 'precontract' ? {} : { forwardInstallMigration }),
      },
      target: {
        ...PLATFORM_VIDEO_IDENTITY_TARGET,
        authoritativeClassification: targetEntry.authoritativeClassification,
      },
      catalog: { table, indexes, foreignKeys },
      dataShape,
      conflicts: {
        captureLimit: CONFLICT_CAPTURE_LIMIT,
        capturedRows: conflictRows.length,
        rowsSha256: sha256(JSON.stringify(conflictRows)),
        rows: conflictRows,
      },
      summary: {
        activeRows: asCount(dataShape.activeRows, 'Active rows'),
        globalVideoDuplicateGroups: asCount(dataShape.globalVideoDuplicateGroups, 'Global duplicate groups'),
        globalVideoDuplicateRows: asCount(dataShape.globalVideoDuplicateRows, 'Global duplicate rows'),
        globalVideoCrossAssetGroups: asCount(dataShape.globalVideoCrossAssetGroups, 'Cross-asset groups'),
        globalVideoCrossAccountGroups: asCount(dataShape.globalVideoCrossAccountGroups, 'Cross-account groups'),
        fallbackDuplicateGroups: asCount(dataShape.fallbackDuplicateGroups, 'Fallback duplicate groups'),
        fallbackDuplicateRows: asCount(dataShape.fallbackDuplicateRows, 'Fallback duplicate rows'),
        orphanAdMaterialRefs: asCount(dataShape.orphanAdMaterialRefs, 'Orphan ad-material refs'),
        waitingLocks,
        legacyDefinitionsEquivalent,
        contractState: currentContractState,
        identityContractPlanReady: tablePresent && historicalAbsent && legacyUsable
          && currentContractState === 'legacy_redundant' && legacyDefinitionsEquivalent
          && !canonicalPresent && noConflicts && waitingLocks === 0,
        postinstallReady: tablePresent && canonicalUsable && noConflicts && waitingLocks === 0,
        postcontractReady: tablePresent && currentContractState === 'canonical_only'
          && canonicalUsable && legacyAbsent
          && noConflicts && waitingLocks === 0,
      },
    };
  });
  return validateProbe(result, state);
}

export function validateQianchuanPlatformVideoIdentityReadonlyProbe(probe) {
  return validateProbe(probe, 'precontract');
}

export function validateQianchuanPlatformVideoIdentityPostinstallReadonlyProbe(probe) {
  return validateProbe(probe, 'postinstall');
}

export function validateQianchuanPlatformVideoIdentityPostcontractReadonlyProbe(probe) {
  return validateProbe(probe, 'postcontract');
}
