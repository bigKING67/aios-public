import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { readVerifiedQianchuanMigrationSource } from './aios-qianchuan-production-migration-p1-review.mjs';
import { validateQianchuanProductionMigrationManifest } from './aios-qianchuan-production-migration-review-queue.mjs';

const MAX_REPOSITORY_EVIDENCE_BYTES = 5 * 1024 * 1024;

function frozenEntries(values) {
  return Object.freeze(values.map((value) => Object.freeze(value)));
}

export const QIANCHUAN_P1D_LINEAGE_FAMILIES = Object.freeze([
  Object.freeze({
    family: 'alimama_incremental_rename',
    label: 'Alimama incremental refresh rename and retirement lineage',
    lineageState: 'replacement_topology_and_source_data_proof_required',
    requiredEvidence: Object.freeze([
      'old_and_replacement_relation_routine_catalog_snapshot',
      'source_data_shape_and_runtime_callsite_review',
      'successor_migration_checksum_provenance',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: frozenEntries([{ version: '20260212_1600' }]),
    relatedMigrations: frozenEntries([{
      version: '20260212_1630',
      needles: Object.freeze([
        'DROP TABLE etl.alimama_goods_marketing_di_refresh_state',
        'refresh_taobao_alimama_goods_marketingscene_incremental',
      ]),
    }]),
    runtimeFiles: frozenEntries([]),
  }),
  Object.freeze({
    family: 'report_channel_localization_rename',
    label: 'Taobao report channel localization through report-model rename',
    lineageState: 'renamed_catalog_and_localized_data_shape_proof_required',
    requiredEvidence: Object.freeze([
      'old_and_current_report_relation_routine_catalog_snapshot',
      'localized_constraint_and_distinct_value_reconciliation',
      'successor_migration_checksum_provenance',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: frozenEntries([{ version: '20260302_1810' }]),
    relatedMigrations: frozenEntries([
      {
        version: '20260430_1200',
        needles: Object.freeze([
          'report_taobao_goods_traffic_channel_metrics_week',
          'refresh_report_taobao_goods_traffic_channel_metrics_week',
        ]),
      },
      {
        version: '20260528_1320',
        needles: Object.freeze(['refresh_report_taobao_goods_traffic_channel_metrics_week']),
      },
    ]),
    runtimeFiles: frozenEntries([]),
  }),
  Object.freeze({
    family: 'creator_live_refund_rename',
    label: 'Creator-live refund metric through influencer-live rename',
    lineageState: 'renamed_column_constraint_routine_and_data_shape_proof_required',
    requiredEvidence: Object.freeze([
      'old_and_current_creator_live_catalog_snapshot',
      'refund_column_constraint_and_routine_definition_hash',
      'creator_live_refund_data_shape_reconciliation',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: frozenEntries([{ version: '20260331_1530' }]),
    relatedMigrations: frozenEntries([
      {
        version: '20260401_0910',
        needles: Object.freeze(['influencer_live_detail', 'live_refund_order_count']),
      },
      {
        version: '20260401_1530',
        needles: Object.freeze(['refresh_creator_live_trade_daily', 'influencer_live_detail']),
      },
    ]),
    runtimeFiles: frozenEntries([{
      path: 'backend-rust/src/dashboard/creator_live_overview/query.sql',
      needles: Object.freeze(['ads.influencer_live_detail', 'live_refund_order_count']),
    }]),
  }),
  Object.freeze({
    family: 'shortvideo_detail_rebuild',
    label: 'Short-video detail rebuild and qianchuan-grain evolution',
    lineageState: 'replacement_relation_routine_index_and_data_shape_proof_required',
    requiredEvidence: Object.freeze([
      'replacement_relation_routine_trigger_and_index_catalog_snapshot',
      'shortvideo_grain_and_mapping_status_reconciliation',
      'successor_migration_checksum_provenance',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: frozenEntries([{ version: '20260424_1730' }]),
    relatedMigrations: frozenEntries([
      {
        version: '20260608_1730',
        needles: Object.freeze(['qianchuan_material_day', 'mapping_status']),
      },
      {
        version: '20260626_1500',
        needles: Object.freeze(['refresh_douyin_shortvideo_detail_incremental']),
      },
    ]),
    runtimeFiles: frozenEntries([]),
  }),
  Object.freeze({
    family: 'influencer_tag_normalization',
    label: 'Influencer-library anchor-tag normalization function and backfill',
    lineageState: 'runtime_function_and_data_backfill_proof_required',
    requiredEvidence: Object.freeze([
      'normalizer_function_catalog_and_definition_hash',
      'normalization_postcondition_mismatch_count',
      'predecessor_function_checksum_provenance',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: frozenEntries([{ version: '20260510_1800' }]),
    relatedMigrations: frozenEntries([{
      version: '20260509_1500',
      needles: Object.freeze(['fn_influencer_library_normalize_anchor_tag', 'ads.influencer_library']),
    }]),
    runtimeFiles: frozenEntries([]),
  }),
  Object.freeze({
    family: 'qianchuan_parse_helpers',
    label: 'Qianchuan report parse-helper runtime contract',
    lineageState: 'runtime_self_provisioning_and_dormant_data_shape_proof_required',
    requiredEvidence: Object.freeze([
      'parse_helper_function_catalog_and_definition_hashes',
      'qianchuan_report_raw_and_dwd_data_shape',
      'runtime_self_provisioning_callsite_hash',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: frozenEntries([{ version: '20260525_1730' }]),
    relatedMigrations: frozenEntries([{
      version: '20260522_1600',
      needles: Object.freeze([
        'ods.qianchuan_material_daily_report_raw',
        'dwd.marketing_content_ad_material_stats_di',
      ]),
    }]),
    runtimeFiles: frozenEntries([{
      path: 'etl/groland_postgres/scripts/marketing_content_assets/qianchuan_reports.py',
      needles: Object.freeze([
        '_ensure_parse_functions(conn)',
        'CREATE OR REPLACE FUNCTION public.marketing_content_parse_numeric',
        'public.marketing_content_parse_rate(raw.raw_ctr)',
      ]),
    }]),
  }),
  Object.freeze({
    family: 'card_ratio_enforcement',
    label: 'Douyin goods-card ratio trigger and backfill enforcement',
    lineageState: 'missing_runtime_contract_and_data_postcondition_proof_required',
    requiredEvidence: Object.freeze([
      'ratio_function_and_trigger_catalog_snapshot',
      'card_and_card_detail_formula_mismatch_counts',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: frozenEntries([{ version: '20260609_2045' }]),
    relatedMigrations: frozenEntries([]),
    runtimeFiles: frozenEntries([]),
  }),
  Object.freeze({
    family: 'platform_video_identity_dedupe',
    label: 'Platform-video duplicate cleanup and asset-video uniqueness guard',
    lineageState: 'data_cleanup_and_exact_unique_guard_proof_required',
    requiredEvidence: Object.freeze([
      'active_duplicate_group_and_archive_marker_reconciliation',
      'current_and_expected_unique_index_definition_comparison',
      'dependent_ad_material_identity_shape',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: frozenEntries([{ version: '20260617_1900' }]),
    relatedMigrations: frozenEntries([{
      version: '20260522_1600',
      needles: Object.freeze(['ads.marketing_content_platform_videos', 'relation_status']),
    }]),
    runtimeFiles: frozenEntries([{
      path: 'scripts/checks/marketing/content-assets-identity-contract.mjs',
      needles: Object.freeze(['idx_marketing_content_platform_videos_asset_video_active']),
    }]),
  }),
]);

function identity(value) {
  return `${value.namespace}/${value.version}`;
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function assertPendingReview(entry, label) {
  const review = entry?.review;
  if (!review || review.decision !== null || review.reviewer !== null
    || review.reviewedAt !== null || review.notes !== null
    || !Array.isArray(review.evidenceLinks) || review.evidenceLinks.length !== 0) {
    throw new Error(`${label} must preserve an unreviewed null decision boundary.`);
  }
}

function validateReviewedP1(packet, packetArtifact, manifestArtifact) {
  if (packet?.schemaVersion !== 1 || packet.mode !== 'offline_readonly_reviewed_p1_overlay'
    || !Array.isArray(packet.entries)) {
    throw new Error('P1D lineage input must be a schemaVersion=1 reviewed P1 overlay.');
  }
  if (packet.sourceArtifact?.sha256 !== manifestArtifact.sha256
    || packet.sourceArtifact?.bytes !== manifestArtifact.bytes
    || packet.sourceArtifact?.path !== manifestArtifact.path) {
    throw new Error('Reviewed P1 overlay was created from a different reconciliation manifest.');
  }
  if (packet.policy?.authoritativeClassificationUnchanged !== true
    || packet.policy?.productionWritesAuthorized !== false
    || packet.policy?.ledgerWritesAuthorized !== false
    || packet.policy?.networkAccess !== false) {
    throw new Error('Reviewed P1 overlay does not preserve the offline read-only boundary.');
  }
  if (packetArtifact?.sha256 == null) throw new Error('Reviewed P1 artifact metadata is required.');
}

function safeRepositoryFile(relativePath, sourceRoot, realpath = realpathSync) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error('P1D repository evidence paths must be repository-relative.');
  }
  const root = path.resolve(sourceRoot);
  const resolved = path.resolve(root, relativePath);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`P1D repository evidence escapes the repository: ${relativePath}.`);
  }
  const actual = realpath(resolved);
  if (actual === root || !actual.startsWith(`${root}${path.sep}`)) {
    throw new Error(`P1D repository evidence resolves outside the repository: ${relativePath}.`);
  }
  return actual;
}

function readRepositoryEvidence(definition, {
  maxBytes = MAX_REPOSITORY_EVIDENCE_BYTES,
  readFile = readFileSync,
  realpath = realpathSync,
  sourceRoot = process.cwd(),
} = {}) {
  const actualPath = safeRepositoryFile(definition.path, sourceRoot, realpath);
  const content = readFile(actualPath);
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (bytes.length > maxBytes) throw new Error(`${definition.path} exceeds ${maxBytes} bytes.`);
  const text = bytes.toString('utf8');
  for (const needle of definition.needles) {
    if (!text.includes(needle)) throw new Error(`${definition.path} no longer contains required P1D lineage evidence: ${needle}.`);
  }
  return {
    path: definition.path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    verifiedNeedles: [...definition.needles],
  };
}

function assertP1dEntryMatchesManifest(p1Entry, manifestEntry) {
  if (p1Entry.checksum !== manifestEntry.checksum
    || p1Entry.relativePath !== manifestEntry.relativePath
    || p1Entry.authoritativeClassification !== manifestEntry.classification
    || p1Entry.schemaEvidenceState !== manifestEntry.schemaEvidenceState
    || p1Entry.reviewWaveLabel !== 'P1D') {
    throw new Error(`${identity(manifestEntry)} P1D packet fields differ from the reconciliation manifest.`);
  }
  assertPendingReview(p1Entry, identity(p1Entry));
}

function relatedMigrationEvidence(definition, manifestEntries, sourceOptions) {
  const entry = manifestEntries.get(`warehouse/${definition.version}`);
  if (!entry) throw new Error(`warehouse/${definition.version} related P1D lineage migration is missing.`);
  const source = readVerifiedQianchuanMigrationSource(entry, sourceOptions);
  const file = readRepositoryEvidence({ path: entry.relativePath, needles: definition.needles }, sourceOptions);
  if (source.bytes !== file.bytes || source.sha256 !== file.sha256) {
    throw new Error(`warehouse/${definition.version} related migration evidence differs from its checksum.`);
  }
  return {
    namespace: entry.namespace,
    version: entry.version,
    checksum: entry.checksum,
    relativePath: entry.relativePath,
    source,
    verifiedNeedles: [...definition.needles],
  };
}

export function buildQianchuanProductionMigrationP1dLineagePacket({
  generatedAt = new Date().toISOString(),
  manifest,
  manifestArtifact,
  manifestSha256,
  p1Packet,
  p1Artifact,
  p1Sha256,
  sourceOptions,
}) {
  validateQianchuanProductionMigrationManifest(manifest);
  assertPinnedMigrationReviewArtifact(manifestArtifact, manifestSha256, 'Reconciliation manifest');
  assertPinnedMigrationReviewArtifact(p1Artifact, p1Sha256, 'Reviewed P1 overlay');
  validateReviewedP1(p1Packet, p1Artifact, manifestArtifact);

  const manifestEntries = new Map(manifest.entries.map((entry) => [identity(entry), entry]));
  const p1dEntries = p1Packet.entries.filter((entry) => entry.reviewWaveLabel === 'P1D');
  const p1dByIdentity = new Map(p1dEntries.map((entry) => [identity(entry), entry]));
  const expectedIdentities = new Set(QIANCHUAN_P1D_LINEAGE_FAMILIES.flatMap((family) => (
    family.entries.map((entry) => `warehouse/${entry.version}`)
  )));
  if (p1dByIdentity.size !== expectedIdentities.size
    || [...expectedIdentities].some((entryIdentity) => !p1dByIdentity.has(entryIdentity))) {
    throw new Error('Current P1D entries differ from the pinned lineage-family inventory.');
  }

  const entries = [];
  const families = [];
  for (const family of QIANCHUAN_P1D_LINEAGE_FAMILIES) {
    const familyEntries = family.entries.map((definition) => {
      const entryIdentity = `warehouse/${definition.version}`;
      const manifestEntry = manifestEntries.get(entryIdentity);
      const p1Entry = p1dByIdentity.get(entryIdentity);
      if (!manifestEntry || manifestEntry.classification !== 'unknown' || !p1Entry) {
        throw new Error(`${entryIdentity} is missing or no longer an unknown current P1D entry.`);
      }
      assertP1dEntryMatchesManifest(p1Entry, manifestEntry);
      const source = readVerifiedQianchuanMigrationSource(manifestEntry, sourceOptions);
      if (p1Entry.source?.bytes !== source.bytes
        || p1Entry.source?.path !== source.path
        || p1Entry.source?.sha256 !== source.sha256) {
        throw new Error(`${entryIdentity} P1D source metadata differs from the repository source.`);
      }
      return {
        namespace: manifestEntry.namespace,
        version: manifestEntry.version,
        checksum: manifestEntry.checksum,
        relativePath: manifestEntry.relativePath,
        source,
        authoritativeClassification: manifestEntry.classification,
        schemaEvidenceState: manifestEntry.schemaEvidenceState,
        executionEvidenceState: manifestEntry.executionEvidenceState,
        ledgerEvidenceState: manifestEntry.ledgerEvidence.state,
        effects: p1Entry.effects,
        unsupportedSignals: [...manifestEntry.unsupportedSignals],
        currentReviewWaveLabel: p1Entry.reviewWaveLabel,
        lineageFamily: family.family,
        lineageState: family.lineageState,
        requiredEvidence: [...family.requiredEvidence],
        review: {
          decision: null,
          evidenceLinks: [],
          notes: null,
          reviewedAt: null,
          reviewer: null,
        },
      };
    });
    const relatedMigrations = family.relatedMigrations.map((definition) => (
      relatedMigrationEvidence(definition, manifestEntries, sourceOptions)
    ));
    const runtimeFiles = family.runtimeFiles.map((definition) => (
      readRepositoryEvidence(definition, sourceOptions)
    ));
    entries.push(...familyEntries);
    families.push({
      family: family.family,
      label: family.label,
      lineageState: family.lineageState,
      requiredEvidence: [...family.requiredEvidence],
      count: familyEntries.length,
      entries: familyEntries.map((entry) => identity(entry)),
      relatedMigrations,
      runtimeFiles,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt,
    mode: 'offline_readonly_p1d_lineage_packet',
    sourceArtifacts: {
      manifest: manifestArtifact,
      p1: p1Artifact,
    },
    policy: {
      authoritativeClassificationUnchanged: true,
      deployAuthorized: false,
      humanReviewerRequired: true,
      ledgerWritesAuthorized: false,
      networkAccess: false,
      ownerDecisionRecorded: false,
      productionWritesAuthorized: false,
      sourceChecksumsVerified: true,
    },
    summary: {
      entries: entries.length,
      families: families.length,
      sourceChecksumsVerified: entries.length,
      relatedMigrationChecksumsVerified: families.reduce((sum, family) => (
        sum + family.relatedMigrations.length
      ), 0),
      runtimeFilesVerified: families.reduce((sum, family) => sum + family.runtimeFiles.length, 0),
      byFamily: countBy(entries, (entry) => entry.lineageFamily),
      byLineageState: countBy(entries, (entry) => entry.lineageState),
      byUnsupportedSignal: countBy(entries.flatMap((entry) => entry.unsupportedSignals), (signal) => signal),
    },
    families,
    entries,
  };
}

export function validateQianchuanProductionMigrationP1dLineagePacket(packet) {
  if (packet?.schemaVersion !== 1 || packet.mode !== 'offline_readonly_p1d_lineage_packet'
    || !Array.isArray(packet.entries) || !Array.isArray(packet.families)
    || packet.summary?.entries !== packet.entries.length
    || packet.summary?.families !== packet.families.length
    || packet.summary?.sourceChecksumsVerified !== packet.entries.length) {
    throw new Error('P1D lineage packet structure is invalid.');
  }
  if (packet.policy?.authoritativeClassificationUnchanged !== true
    || packet.policy?.humanReviewerRequired !== true
    || packet.policy?.ownerDecisionRecorded !== false
    || packet.policy?.productionWritesAuthorized !== false
    || packet.policy?.ledgerWritesAuthorized !== false
    || packet.policy?.deployAuthorized !== false
    || packet.policy?.networkAccess !== false) {
    throw new Error('P1D lineage packet policy is unsafe.');
  }
  if (packet.entries.some((entry) => entry.currentReviewWaveLabel !== 'P1D'
    || entry.authoritativeClassification !== 'unknown')) {
    throw new Error('P1D lineage packet entries no longer preserve the unresolved P1D boundary.');
  }
  for (const entry of packet.entries) assertPendingReview(entry, identity(entry));
  return packet;
}
