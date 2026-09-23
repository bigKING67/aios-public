import { QIANCHUAN_SCHEMA_CONFLICT_STATES } from './aios-qianchuan-production-migration-review-policy.mjs';
import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';
import { qianchuanP1cCatalogMappingsForFamily } from './aios-qianchuan-production-migration-p1c-catalog-map.mjs';
import {
  readVerifiedQianchuanMigrationSource,
  summarizeQianchuanMigrationEffects,
} from './aios-qianchuan-production-migration-p1-review.mjs';
import { validateQianchuanProductionMigrationManifest } from './aios-qianchuan-production-migration-review-queue.mjs';

const REVIEWED_P1_MODES = new Set([
  'offline_readonly_p1_review_packet',
  'offline_readonly_reviewed_p1_overlay',
]);

const EXPLICIT_RELATION_DROP_ENTRIES = Object.freeze([
  Object.freeze({
    dropVersion: '20260430_1200',
    supersededEffectKeys: Object.freeze([
      'index:dwd.idx_all_trade_sale_date',
      'index:dwd.idx_all_trade_sale_platform',
      'index:dwd.idx_all_trade_sale_shop_id',
      'trigger:dwd.all_trade_sale.trg_touch_all_trade_sale_updated_at',
    ]),
    version: '20260211_2000',
  }),
  Object.freeze({
    dropVersion: '20260430_1200',
    supersededEffectKeys: Object.freeze([
      'index:dws.idx_all_trade_sale_daily_date',
      'trigger:dws.all_trade_sale_daily.trg_touch_all_trade_sale_daily_updated_at',
    ]),
    version: '20260212_1000',
  }),
  Object.freeze({
    dropVersion: '20260430_1200',
    supersededEffectKeys: Object.freeze([
      'trigger:ads.all_trade_week.trg_touch_all_trade_week_updated_at',
    ]),
    version: '20260218_1000',
  }),
  Object.freeze({
    dropVersion: '20260430_1200',
    supersededEffectKeys: Object.freeze([
      'index:ads.idx_all_trade_week_platform_platform',
      'trigger:ads.all_trade_week_platform.trg_touch_all_trade_week_platform_updated_at',
    ]),
    version: '20260224_1600',
  }),
]);

export const QIANCHUAN_P1C_LINEAGE_FAMILIES = Object.freeze([
  Object.freeze({
    family: 'explicit_relation_drop',
    label: 'Explicit DROP TABLE dependency supersession',
    lineageState: 'static_dependency_supersession_verified_execution_unknown',
    requiredEvidence: Object.freeze([
      'migration_execution_or_not_applicable_owner_review',
      'routine_definition_hash',
      'data_shape_or_backfill_reconciliation',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: EXPLICIT_RELATION_DROP_ENTRIES,
  }),
  Object.freeze({
    family: 'dynamic_report_rename',
    label: 'Dynamic report-model rename lineage',
    lineageState: 'manual_lineage_and_runtime_proof_required',
    requiredEvidence: Object.freeze([
      'validated_dynamic_rename_lineage',
      'replacement_relation_and_routine_catalog_snapshot',
      'data_shape_or_backfill_reconciliation',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: Object.freeze([
      '20260228_1500',
      '20260228_1830',
      '20260302_1700',
      '20260302_1900',
      '20260303_1600',
      '20260303_1900',
      '20260305_1400',
      '20260305_1410',
      '20260305_1420',
    ].map((version) => Object.freeze({ version }))),
  }),
  Object.freeze({
    family: 'creator_live_rename',
    label: 'Creator-live rename and compatibility-view lineage',
    lineageState: 'manual_lineage_and_runtime_proof_required',
    requiredEvidence: Object.freeze([
      'validated_creator_live_rename_lineage',
      'replacement_relation_index_and_routine_catalog_snapshot',
      'creator_live_data_shape_reconciliation',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: Object.freeze([
      Object.freeze({ version: '20260331_1130' }),
      Object.freeze({ version: '20260331_2010' }),
    ]),
  }),
  Object.freeze({
    family: 'live_dashboard_replacement',
    label: 'Live-dashboard replacement lineage',
    lineageState: 'manual_lineage_and_runtime_proof_required',
    requiredEvidence: Object.freeze([
      'replacement_relation_and_routine_catalog_snapshot',
      'live_dashboard_data_shape_reconciliation',
      'self_anchor_mapping_provenance',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: Object.freeze([Object.freeze({ version: '20260422_1510' })]),
  }),
  Object.freeze({
    family: 'shortvideo_detail_evolution',
    label: 'Short-video detail evolution lineage',
    lineageState: 'manual_lineage_and_runtime_proof_required',
    requiredEvidence: Object.freeze([
      'shortvideo_relation_index_and_routine_lineage',
      'shortvideo_data_shape_reconciliation',
      'self_anchor_mapping_provenance',
      'repository_checksum_and_deployment_provenance',
    ]),
    entries: Object.freeze([Object.freeze({ version: '20260424_1100' })]),
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

function validateP1Packet(packet, packetArtifact, manifestArtifact) {
  if (packet?.schemaVersion !== 1 || !REVIEWED_P1_MODES.has(packet.mode)
    || !Array.isArray(packet.entries)) {
    throw new Error('P1C lineage input must be a schemaVersion=1 P1 review packet.');
  }
  if (packet.sourceArtifact?.sha256 !== manifestArtifact.sha256
    || packet.sourceArtifact?.bytes !== manifestArtifact.bytes
    || packet.sourceArtifact?.path !== manifestArtifact.path) {
    throw new Error('P1 review packet was created from a different reconciliation manifest.');
  }
  if (packet.policy?.authoritativeClassificationUnchanged !== true
    || packet.policy?.productionWritesAuthorized !== false
    || packet.policy?.networkAccess !== false) {
    throw new Error('P1 review packet does not preserve the offline read-only boundary.');
  }
  if (packetArtifact?.sha256 == null) throw new Error('P1 review artifact metadata is required.');
}

function assertExplicitDropSupersession(entry, definition) {
  if (QIANCHUAN_SCHEMA_CONFLICT_STATES.has(entry.schemaEvidenceState)) {
    throw new Error(`${identity(entry)} still has a current schema conflict after explicit DROP TABLE propagation.`);
  }
  const effects = new Map(entry.catalogEffects.map((effect) => [effect.key, effect]));
  return definition.supersededEffectKeys.map((key) => {
    const effect = effects.get(key);
    if (!effect || effect.supersededBy !== definition.dropVersion) {
      throw new Error(`${identity(entry)} does not prove ${key} was superseded by ${definition.dropVersion}.`);
    }
    return {
      key,
      kind: effect.kind,
      relation: effect.relation,
      supersededBy: effect.supersededBy,
    };
  });
}

function assertP1EntryMatchesManifest(p1Entry, manifestEntry) {
  if (p1Entry.checksum !== manifestEntry.checksum
    || p1Entry.relativePath !== manifestEntry.relativePath
    || p1Entry.authoritativeClassification !== manifestEntry.classification
    || p1Entry.schemaEvidenceState !== manifestEntry.schemaEvidenceState
    || p1Entry.reviewWaveLabel !== 'P1C') {
    throw new Error(`${identity(manifestEntry)} P1C packet fields differ from the reconciliation manifest.`);
  }
  assertPendingReview(p1Entry, identity(p1Entry));
}

function packetEntry({
  definition,
  family,
  manifestEntry,
  p1Entry,
  sourceOptions,
}) {
  const source = readVerifiedQianchuanMigrationSource(manifestEntry, sourceOptions);
  if (p1Entry?.source && (
    p1Entry.source.bytes !== source.bytes
    || p1Entry.source.path !== source.path
    || p1Entry.source.sha256 !== source.sha256
  )) {
    throw new Error(`${identity(manifestEntry)} P1C source metadata differs from the repository source.`);
  }
  const staticSupersession = family.family === 'explicit_relation_drop'
    ? assertExplicitDropSupersession(manifestEntry, definition)
    : [];
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
    effects: summarizeQianchuanMigrationEffects(manifestEntry),
    unsupportedSignals: [...manifestEntry.unsupportedSignals],
    currentReviewWaveLabel: p1Entry?.reviewWaveLabel ?? null,
    lineageFamily: family.family,
    lineageState: family.lineageState,
    requiredEvidence: [...family.requiredEvidence],
    staticSupersession,
    review: {
      decision: null,
      evidenceLinks: [],
      notes: null,
      reviewedAt: null,
      reviewer: null,
    },
  };
}

export function buildQianchuanProductionMigrationP1cLineagePacket({
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
  assertPinnedMigrationReviewArtifact(p1Artifact, p1Sha256, 'P1 review packet');
  validateP1Packet(p1Packet, p1Artifact, manifestArtifact);

  const manifestEntries = new Map(manifest.entries.map((entry) => [identity(entry), entry]));
  const p1cEntries = p1Packet.entries.filter((entry) => entry.reviewWaveLabel === 'P1C');
  const p1cByIdentity = new Map(p1cEntries.map((entry) => [identity(entry), entry]));
  const expectedP1cIdentities = new Set(QIANCHUAN_P1C_LINEAGE_FAMILIES
    .filter((family) => family.family !== 'explicit_relation_drop')
    .flatMap((family) => family.entries.map((entry) => `warehouse/${entry.version}`)));
  const actualP1cIdentities = new Set(p1cByIdentity.keys());
  if (actualP1cIdentities.size !== expectedP1cIdentities.size
    || [...expectedP1cIdentities].some((entryIdentity) => !actualP1cIdentities.has(entryIdentity))) {
    throw new Error('Current P1C entries differ from the pinned lineage-family inventory.');
  }

  const entries = [];
  const families = [];
  for (const family of QIANCHUAN_P1C_LINEAGE_FAMILIES) {
    const familyEntries = family.entries.map((definition) => {
      const entryIdentity = `warehouse/${definition.version}`;
      const manifestEntry = manifestEntries.get(entryIdentity);
      if (!manifestEntry || manifestEntry.classification !== 'unknown') {
        throw new Error(`${entryIdentity} is missing or no longer has authoritative classification unknown.`);
      }
      const p1Entry = p1cByIdentity.get(entryIdentity) ?? null;
      if (family.family === 'explicit_relation_drop') {
        if (p1Entry) throw new Error(`${entryIdentity} unexpectedly remains in the current P1C packet.`);
      } else {
        if (!p1Entry) throw new Error(`${entryIdentity} is missing from the current P1C packet.`);
        assertP1EntryMatchesManifest(p1Entry, manifestEntry);
      }
      return packetEntry({ definition, family, manifestEntry, p1Entry, sourceOptions });
    });
    entries.push(...familyEntries);
    families.push({
      family: family.family,
      label: family.label,
      lineageState: family.lineageState,
      requiredEvidence: [...family.requiredEvidence],
      catalogMappings: qianchuanP1cCatalogMappingsForFamily(family.family),
      count: familyEntries.length,
      entries: familyEntries.map((entry) => identity(entry)),
    });
  }

  return {
    schemaVersion: 1,
    generatedAt,
    mode: 'offline_readonly_p1c_lineage_packet',
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
      staticDependencySupersessionEntries: entries.filter((entry) => (
        entry.lineageFamily === 'explicit_relation_drop'
      )).length,
      remainingP1cEntries: entries.filter((entry) => entry.currentReviewWaveLabel === 'P1C').length,
      sourceChecksumsVerified: entries.length,
      byFamily: countBy(entries, (entry) => entry.lineageFamily),
      byLineageState: countBy(entries, (entry) => entry.lineageState),
    },
    families,
    entries,
  };
}

export function validateQianchuanProductionMigrationP1cLineagePacket(packet) {
  if (packet?.schemaVersion !== 1 || packet.mode !== 'offline_readonly_p1c_lineage_packet'
    || !Array.isArray(packet.entries) || !Array.isArray(packet.families)
    || packet.summary?.entries !== packet.entries.length
    || packet.summary?.sourceChecksumsVerified !== packet.entries.length) {
    throw new Error('P1C lineage packet structure is invalid.');
  }
  if (packet.policy?.authoritativeClassificationUnchanged !== true
    || packet.policy?.humanReviewerRequired !== true
    || packet.policy?.sourceChecksumsVerified !== true
    || packet.policy?.ownerDecisionRecorded !== false
    || packet.policy?.productionWritesAuthorized !== false
    || packet.policy?.ledgerWritesAuthorized !== false
    || packet.policy?.deployAuthorized !== false
    || packet.policy?.networkAccess !== false) {
    throw new Error('P1C lineage packet policy is unsafe.');
  }
  if (packet.entries.some((entry) => (
    entry.authoritativeClassification !== 'unknown'
    || entry.review?.decision !== null
    || entry.review?.reviewer !== null
  ))) {
    throw new Error('P1C lineage packet must preserve unknown classifications and null owner decisions.');
  }
  return packet;
}
