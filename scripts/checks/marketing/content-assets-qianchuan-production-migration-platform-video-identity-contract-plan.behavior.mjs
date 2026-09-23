#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  formatQianchuanPlatformVideoIdentityContractPlan,
  parseQianchuanPlatformVideoIdentityContractPlanArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-platform-video-identity-contract-plan-cli.mjs';
import {
  buildQianchuanPlatformVideoIdentityContractPlan,
  QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION,
  validateQianchuanPlatformVideoIdentityContractPlan,
  validateQianchuanPlatformVideoIdentityForwardInstallMigrationAsset,
} from '../../lib/migrations/aios-qianchuan-production-migration-platform-video-identity-contract-plan.mjs';
import {
  formatQianchuanPlatformVideoIdentityReadonlyProbe,
  parseQianchuanPlatformVideoIdentityReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-platform-video-identity-readonly-probe-cli.mjs';
import {
  PLATFORM_VIDEO_IDENTITY_INDEXES,
  runQianchuanPlatformVideoIdentityReadonlyProbe,
  validateQianchuanPlatformVideoIdentityPostcontractReadonlyProbe,
  validateQianchuanPlatformVideoIdentityPostinstallReadonlyProbe,
  validateQianchuanPlatformVideoIdentityReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-platform-video-identity-readonly-probe.mjs';

const TARGET_IDENTITY = 'warehouse/20260617_1900';
const TARGET_CHECKSUM = '572dbc25d198cf81276866b7e2f877d258ce940a8c06b974f467527ff52d3d5e';
const TARGET_SOURCE = 'etl/groland_postgres/sql/migrations/20260617_1900__dedupe_marketing_content_platform_video_identities.sql';
const RELATION = 'ads.marketing_content_platform_videos';
const forwardInstallMigrationSql = readFileSync(new URL(
  '../../../etl/groland_postgres/sql/migrations/20260726_1000__enforce_marketing_content_platform_video_identity.sql',
  import.meta.url,
), 'utf8');
const forwardInstallMigrationEvidence = validateQianchuanPlatformVideoIdentityForwardInstallMigrationAsset({
  forwardMigrationPath: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.path,
  forwardMigrationSql: forwardInstallMigrationSql,
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function artifact(value, artifactPath) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return { path: artifactPath, bytes: Buffer.byteLength(content), sha256: sha256(content) };
}

const p1Packet = {
  mode: 'offline_readonly_reviewed_p1_overlay',
  policy: { productionWritesAuthorized: false, ledgerWritesAuthorized: false },
  summary: { byWave: { P1D: 1 } },
  entries: [{
    namespace: 'warehouse',
    version: '20260617_1900',
    relativePath: TARGET_SOURCE,
    checksum: TARGET_CHECKSUM,
    authoritativeClassification: 'unknown',
    reviewWaveLabel: 'P1D',
    review: { decision: null, reviewer: null },
    effects: {
      satisfied: 0,
      unsatisfied: 1,
      unsatisfiedCurrentEffects: [{
        expectedPresent: true,
        key: `index:${PLATFORM_VIDEO_IDENTITY_INDEXES.historicalAssetVideo}`,
        present: false,
      }],
    },
    unsupportedSignals: ['dml_or_backfill', 'unsupported_ddl'],
  }],
};
const p1Artifact = artifact(p1Packet, '/tmp/platform-video-reviewed-p1.json');
const p1dProbe = {
  schemaVersion: 1,
  mode: 'live_readonly_p1d_catalog_data_shape_probe',
  policy: {
    transaction: 'BEGIN READ ONLY / ROLLBACK',
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
    ownerDecisionRecorded: false,
    deployAuthorized: false,
    arkInvoked: false,
  },
  entryEvidence: [{
    family: 'platform_video_identity_dedupe',
    entries: [TARGET_IDENTITY],
    evidenceState: 'clean_current_data_without_exact_unique_guard',
    decision: null,
    reviewer: null,
  }],
  dataShapes: { platformVideo: { duplicateGroups: '0' } },
};
const p1dProbeArtifact = artifact(p1dProbe, '/tmp/platform-video-p1d-probe.json');

function legacyDefinition(name) {
  return `CREATE UNIQUE INDEX ${name} ON ${RELATION} USING btree (platform, COALESCE(account_id, ''::text), COALESCE(external_video_id, ''::text), COALESCE(external_item_id, ''::text), COALESCE(external_note_id, ''::text)) WHERE ((relation_status = 'active'::text) AND (COALESCE(NULLIF(external_video_id, ''::text), NULLIF(external_item_id, ''::text), NULLIF(external_note_id, ''::text)) IS NOT NULL))`;
}

function canonicalExternalVideoDefinition(name) {
  return `CREATE UNIQUE INDEX ${name} ON ${RELATION} USING btree (platform, NULLIF(btrim(external_video_id), ''::text)) WHERE ((relation_status = 'active'::text) AND (NULLIF(btrim(external_video_id), ''::text) IS NOT NULL))`;
}

function canonicalItemNoteDefinition(name) {
  return `CREATE UNIQUE INDEX ${name} ON ${RELATION} USING btree (platform, COALESCE(NULLIF(btrim(account_id), ''::text), ''::text), COALESCE(NULLIF(btrim(external_item_id), ''::text), ''::text), COALESCE(NULLIF(btrim(external_note_id), ''::text), ''::text)) WHERE ((relation_status = 'active'::text) AND (NULLIF(btrim(external_video_id), ''::text) IS NULL) AND (COALESCE(NULLIF(btrim(external_item_id), ''::text), NULLIF(btrim(external_note_id), ''::text)) IS NOT NULL))`;
}

class FakeClient {
  constructor({
    failOn = null,
    fallbackDuplicateGroups = 0,
    globalVideoDuplicateGroups = 0,
    historicalPresent = false,
    invalidCanonical = false,
    invalidLegacy = false,
    state = 'precontract',
    waitingLocks = 0,
  } = {}) {
    Object.assign(this, {
      failOn,
      fallbackDuplicateGroups,
      globalVideoDuplicateGroups,
      historicalPresent,
      invalidCanonical,
      invalidLegacy,
      state,
      waitingLocks,
    });
    this.queries = [];
  }

  indexRow(identity) {
    const canonicalPresent = this.state !== 'precontract';
    const legacyPresent = this.state !== 'postcontract';
    let present = false;
    let definition = null;
    if (identity === PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalExternalVideo) {
      present = canonicalPresent;
      definition = canonicalExternalVideoDefinition(identity.split('.')[1]);
    } else if (identity === PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalItemNote) {
      present = canonicalPresent;
      definition = canonicalItemNoteDefinition(identity.split('.')[1]);
    } else if (identity === PLATFORM_VIDEO_IDENTITY_INDEXES.historicalAssetVideo) {
      present = this.historicalPresent;
      definition = `CREATE UNIQUE INDEX fixture ON ${RELATION} USING btree (asset_id, platform, external_video_id)`;
    } else {
      present = legacyPresent;
      definition = legacyDefinition(identity.split('.')[1]);
    }
    if (present && this.invalidCanonical && identity === PLATFORM_VIDEO_IDENTITY_INDEXES.canonicalExternalVideo) {
      definition = definition.replace('(platform, NULLIF', '(platform, asset_id, NULLIF');
    }
    if (present && this.invalidLegacy && identity === PLATFORM_VIDEO_IDENTITY_INDEXES.legacyVideo) {
      definition = definition.replace(', COALESCE(external_note_id, \'\'::text)', '');
    }
    return {
      identity,
      oid: present ? String(100 + this.queries.length) : null,
      table_name: present ? RELATION : null,
      is_unique: present ? true : null,
      is_valid: present ? true : null,
      is_ready: present ? true : null,
      definition: present ? definition : null,
      index_bytes: present ? '16384' : null,
      index_scans: present ? '7' : '0',
    };
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (this.failOn && sql.includes(this.failOn)) throw new Error('fixture query failure');
    if (sql === 'BEGIN READ ONLY' || sql.startsWith('SET LOCAL') || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('aios_qianchuan_platform_video_identity:table_stats')) {
      return { rows: [{
        qualified_name: RELATION,
        oid: '42',
        relation_kind: 'r',
        heap_bytes: '65536',
        index_bytes: '32768',
        total_bytes: '98304',
        estimated_live_rows: '39',
        estimated_dead_rows: '2',
        granted_locks: '1',
        waiting_locks: String(this.waitingLocks),
      }] };
    }
    if (sql.includes('aios_qianchuan_platform_video_identity:indexes')) {
      return { rows: params[0].map((identity) => this.indexRow(identity)) };
    }
    if (sql.includes('aios_qianchuan_platform_video_identity:foreign_keys')) return { rows: [] };
    if (sql.includes('aios_qianchuan_platform_video_identity:identity_summary')) {
      return { rows: [{
        rows: '39',
        active_rows: '37',
        external_video_rows: '30',
        fallback_rows: '6',
        blank_identity_rows: '1',
        global_video_duplicate_groups: String(this.globalVideoDuplicateGroups),
        global_video_duplicate_rows: String(this.globalVideoDuplicateGroups),
        global_video_cross_asset_groups: String(this.globalVideoDuplicateGroups),
        global_video_cross_account_groups: '0',
        same_asset_video_duplicate_groups: '0',
        same_asset_video_duplicate_rows: '0',
        fallback_duplicate_groups: String(this.fallbackDuplicateGroups),
        fallback_duplicate_rows: String(this.fallbackDuplicateGroups),
        legacy_tuple_duplicate_groups: '0',
        legacy_tuple_duplicate_rows: '0',
        active_ad_material_refs: '12',
        orphan_ad_material_refs: '0',
      }] };
    }
    if (sql.includes('aios_qianchuan_platform_video_identity:conflict_rows')) {
      const rows = [];
      if (this.globalVideoDuplicateGroups > 0) rows.push({
        identity_kind: 'external_video',
        platform_video_id: 'video-1',
        asset_id: 'asset-1',
        platform: 'douyin',
        account_id: 'account-1',
        external_video_id: 'aweme-1',
        external_item_id: null,
        external_note_id: null,
        identity_rows: '2',
      });
      if (this.fallbackDuplicateGroups > 0) rows.push({
        identity_kind: 'item_note_fallback',
        platform_video_id: 'video-2',
        asset_id: 'asset-2',
        platform: 'douyin',
        account_id: 'account-2',
        external_video_id: null,
        external_item_id: 'item-2',
        external_note_id: null,
        identity_rows: '2',
      });
      return { rows };
    }
    throw new Error(`Unexpected fixture SQL: ${sql.slice(0, 120)}`);
  }
}

function probeArgs(client, overrides = {}) {
  const state = overrides.state ?? 'precontract';
  return {
    client,
    now: () => new Date('2026-07-25T08:00:00.000Z'),
    p1Artifact,
    p1Packet,
    p1Sha256: p1Artifact.sha256,
    p1dProbe,
    p1dProbeArtifact,
    p1dProbeSha256: p1dProbeArtifact.sha256,
    ...(state === 'precontract' ? {} : { forwardInstallMigration: forwardInstallMigrationEvidence }),
    ...overrides,
  };
}

function assertReadOnlyQueries(client) {
  for (const { sql } of client.queries) {
    const allowed = sql === 'BEGIN READ ONLY'
      || sql === 'ROLLBACK'
      || /^SET LOCAL statement_timeout = '\d+ms'$/u.test(sql)
      || /^\/\*[\s\S]*?\*\/\s*(?:SELECT|WITH)\b/iu.test(sql);
    assert.equal(allowed, true, `unexpected SQL outside the read-only allowlist: ${sql}`);
    assert.doesNotMatch(sql, /\b(?:COMMIT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|COPY|MERGE)\b/iu);
  }
}

const precontractClient = new FakeClient();
const precontract = await runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(precontractClient));
assert.equal(validateQianchuanPlatformVideoIdentityReadonlyProbe(precontract), precontract);
assert.equal(precontract.summary.contractState, 'legacy_redundant');
assert.equal(precontract.summary.identityContractPlanReady, true);
assert.equal(precontract.summary.globalVideoDuplicateGroups, 0);
assert.equal(precontract.summary.fallbackDuplicateGroups, 0);
assert.equal(precontractClient.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(precontractClient);

const reducedCohortPacket = structuredClone(p1Packet);
reducedCohortPacket.summary.byWave.P1D = 3;
reducedCohortPacket.entries.push(
  {
    namespace: 'warehouse',
    version: '20260510_1800',
    authoritativeClassification: 'unknown',
    reviewWaveLabel: 'P1D',
    review: { decision: null, reviewer: null },
  },
  {
    namespace: 'warehouse',
    version: '20260525_1730',
    authoritativeClassification: 'unknown',
    reviewWaveLabel: 'P1D',
    review: { decision: null, reviewer: null },
  },
);
const reducedCohortArtifact = artifact(reducedCohortPacket, '/tmp/platform-video-reviewed-p1-reduced.json');
const reducedCohortClient = new FakeClient();
const reducedCohortProbe = await runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(
  reducedCohortClient,
  {
    p1Artifact: reducedCohortArtifact,
    p1Packet: reducedCohortPacket,
    p1Sha256: reducedCohortArtifact.sha256,
  },
));
assert.equal(reducedCohortProbe.summary.identityContractPlanReady, true);
assertReadOnlyQueries(reducedCohortClient);

const inconsistentCohortPacket = structuredClone(p1Packet);
inconsistentCohortPacket.summary.byWave.P1D = 2;
const inconsistentCohortArtifact = artifact(
  inconsistentCohortPacket,
  '/tmp/platform-video-reviewed-p1-inconsistent.json',
);
const inconsistentCohortClient = new FakeClient();
await assert.rejects(
  runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(inconsistentCohortClient, {
    p1Artifact: inconsistentCohortArtifact,
    p1Packet: inconsistentCohortPacket,
    p1Sha256: inconsistentCohortArtifact.sha256,
  })),
  /self-consistent unresolved P1D boundary/,
);
assert.equal(inconsistentCohortClient.queries.length, 0);

const tamperedProbe = structuredClone(precontract);
delete tamperedProbe.sourceArtifacts.p1dProbe;
assert.throws(
  () => validateQianchuanPlatformVideoIdentityReadonlyProbe(tamperedProbe),
  /source artifacts are incomplete/,
);
const driftedSummaryProbe = structuredClone(precontract);
driftedSummaryProbe.summary.activeRows += 1;
assert.throws(
  () => validateQianchuanPlatformVideoIdentityReadonlyProbe(driftedSummaryProbe),
  /activeRows is inconsistent with data-shape evidence/,
);

const postinstallClient = new FakeClient({ state: 'postinstall' });
const postinstall = await runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(postinstallClient, {
  state: 'postinstall',
}));
assert.equal(validateQianchuanPlatformVideoIdentityPostinstallReadonlyProbe(postinstall), postinstall);
assert.equal(postinstall.summary.contractState, 'canonical_and_legacy_parallel');
assert.equal(
  postinstall.sourceArtifacts.forwardInstallMigration.identity,
  QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.identity,
);
assert.throws(
  () => validateQianchuanPlatformVideoIdentityReadonlyProbe(postinstall),
  /source artifacts are incomplete|precontract evidence is not ready/,
);

const postcontractClient = new FakeClient({ state: 'postcontract' });
const postcontract = await runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(postcontractClient, {
  state: 'postcontract',
}));
assert.equal(validateQianchuanPlatformVideoIdentityPostcontractReadonlyProbe(postcontract), postcontract);
assert.equal(postcontract.summary.contractState, 'canonical_only');
const missingForwardInstall = structuredClone(postinstall);
delete missingForwardInstall.sourceArtifacts.forwardInstallMigration;
assert.throws(
  () => validateQianchuanPlatformVideoIdentityPostinstallReadonlyProbe(missingForwardInstall),
  /source artifacts are incomplete/,
);
const driftedForwardInstall = structuredClone(postinstall);
driftedForwardInstall.sourceArtifacts.forwardInstallMigration.sha256 = '0'.repeat(64);
assert.throws(
  () => validateQianchuanPlatformVideoIdentityPostinstallReadonlyProbe(driftedForwardInstall),
  /forward install migration evidence is invalid/,
);

for (const client of [
  new FakeClient({ globalVideoDuplicateGroups: 1 }),
  new FakeClient({ fallbackDuplicateGroups: 1 }),
  new FakeClient({ waitingLocks: 1 }),
  new FakeClient({ invalidLegacy: true }),
  new FakeClient({ historicalPresent: true }),
]) {
  await assert.rejects(
    runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(client)),
    /precontract evidence is not ready/,
  );
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
  assertReadOnlyQueries(client);
}

const invalidCanonicalClient = new FakeClient({ invalidCanonical: true, state: 'postinstall' });
await assert.rejects(
  runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(invalidCanonicalClient, { state: 'postinstall' })),
  /postinstall evidence is incomplete/,
);
assert.equal(invalidCanonicalClient.queries.at(-1).sql, 'ROLLBACK');

const failingClient = new FakeClient({ failOn: 'identity_summary' });
await assert.rejects(
  runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(failingClient)),
  /fixture query failure/,
);
assert.equal(failingClient.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(failingClient);

await assert.rejects(
  runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(new FakeClient(), { state: 'unknown' })),
  /Unsupported platform-video identity probe state/,
);
await assert.rejects(
  runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(new FakeClient(), { statementTimeoutMs: 999 })),
  /statementTimeoutMs must be between 1000 and 120000/,
);
await assert.rejects(
  runQianchuanPlatformVideoIdentityReadonlyProbe(probeArgs(new FakeClient(), { p1Sha256: '0'.repeat(64) })),
  /Reviewed P1 overlay SHA-256 differs/,
);

const probeText = formatQianchuanPlatformVideoIdentityReadonlyProbe(precontract, {
  path: '/tmp/platform-video-probe.json', bytes: 2000, sha256: 'c'.repeat(64),
});
assert.match(probeText, /global_duplicates=0\/0 cross_asset=0 cross_account=0/);
assert.doesNotMatch(probeText, /aweme-1|video-1|asset-1/);

assert.deepEqual(parseQianchuanPlatformVideoIdentityReadonlyProbeArgs([
  '--p1', '/tmp/p1.json',
  `--p1-sha256=${'a'.repeat(64)}`,
  '--p1d-probe', '/tmp/p1d.json',
  `--p1d-probe-sha256=${'b'.repeat(64)}`,
  '--output', '/tmp/platform-video.json',
  '--postinstall',
]), {
  help: false,
  outputPath: '/tmp/platform-video.json',
  p1Path: '/tmp/p1.json',
  p1Sha256: 'a'.repeat(64),
  p1dProbePath: '/tmp/p1d.json',
  p1dProbeSha256: 'b'.repeat(64),
  state: 'postinstall',
});
assert.throws(
  () => parseQianchuanPlatformVideoIdentityReadonlyProbeArgs(['--postinstall', '--postcontract']),
  /mutually exclusive/,
);
for (const option of ['--apply', '--deploy', '--execute', '--json', '--repair', '--write-ledger']) {
  assert.throws(
    () => parseQianchuanPlatformVideoIdentityReadonlyProbeArgs([option]),
    /not supported by the live read-only platform-video identity probe/,
  );
}

const sourcePaths = {
  historicalMigration: '../../../etl/groland_postgres/sql/migrations/20260617_1900__dedupe_marketing_content_platform_video_identities.sql',
  initialIndexMigration: '../../../etl/groland_postgres/sql/migrations/20260522_1600__create_ads_marketing_content_assets.sql',
  performanceIndexMigration: '../../../etl/groland_postgres/sql/migrations/20260525_1930__add_marketing_content_performance_indexes.sql',
  identityLookup: '../../../backend-rust/src/marketing/content_assets/identity_lookup.rs',
  identityMutations: '../../../backend-rust/src/marketing/content_assets/identity_mutations.rs',
  yuntuArchiveRepository: '../../../etl/groland_postgres/scripts/marketing_content_assets/yuntu_archive_repository.py',
};
const sources = Object.fromEntries(Object.entries(sourcePaths).map(([key, relativePath]) => [
  key,
  readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
]));
const postinstallSqlCheck = readFileSync(new URL(
  '../../../etl/groland_postgres/tests/sql/marketing_content_platform_video_identity_check.sql',
  import.meta.url,
), 'utf8');
const probeArtifact = artifact(precontract, '/tmp/platform-video-identity-precontract.json');
const plan = buildQianchuanPlatformVideoIdentityContractPlan({
  generatedAt: '2026-07-25T09:00:00.000Z',
  probe: precontract,
  probeArtifact,
  probeSha256: probeArtifact.sha256,
  sources,
});
assert.equal(validateQianchuanPlatformVideoIdentityContractPlan(plan), plan);
assert.equal(plan.decision.externalVideoScope, 'global_across_assets_and_accounts');
assert.equal(plan.decision.assetIdIsIdentityComponent, false);
assert.equal(plan.decision.historicalMigrationReplayRecommended, false);
assert.equal(plan.decision.dataMutationRequired, false);
assert.equal(plan.migrations.installCanonicalGuards.indexes.length, 2);
assert.equal(plan.migrations.removeRedundantLegacyGuards.indexes.length, 2);
assert.equal(plan.summary.requiredIndependentPostchecks, 2);
assert.doesNotMatch(plan.migrations.installCanonicalGuards.sql, /\b(?:UPDATE|DELETE|INSERT|ALTER\s+TABLE|DROP\s+TABLE)\b/iu);
assert.match(plan.migrations.removeRedundantLegacyGuards.sql, /^DROP INDEX/u);

const forwardInstallMigration = validateQianchuanPlatformVideoIdentityForwardInstallMigrationAsset({
  forwardMigrationPath: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.path,
  forwardMigrationSql: forwardInstallMigrationSql,
});
assert.equal(forwardInstallMigration.identity, 'warehouse/20260726_1000');
assert.equal(forwardInstallMigration.reviewedSqlSha256, plan.migrations.installCanonicalGuards.sha256);
assert.deepEqual(forwardInstallMigration.indexes, plan.migrations.installCanonicalGuards.indexes);
assert.throws(
  () => validateQianchuanPlatformVideoIdentityForwardInstallMigrationAsset({
    forwardMigrationPath: 'etl/groland_postgres/sql/migrations/20260726_1001__enforce_marketing_content_platform_video_identity.sql',
    forwardMigrationSql: forwardInstallMigrationSql,
  }),
  /path differs from the staged repository identity/,
);
assert.throws(
  () => validateQianchuanPlatformVideoIdentityForwardInstallMigrationAsset({
    forwardMigrationPath: QIANCHUAN_PLATFORM_VIDEO_IDENTITY_FORWARD_INSTALL_MIGRATION.path,
    forwardMigrationSql: `${forwardInstallMigrationSql}\nDROP INDEX ads.idx_ads_mc_platform_video_identity_active;\n`,
  }),
  /unauthorized SQL statement|must preserve the exact reviewed canonical-guard SQL/,
);
for (const marker of [
  'idx_marketing_content_platform_videos_external_video_active',
  'idx_marketing_content_platform_videos_item_note_active',
  'indisunique',
  'indisvalid',
  'indisready',
  'active external-video identity duplicates remain',
  'active fallback platform-video identity duplicates remain',
]) {
  assert.match(postinstallSqlCheck, new RegExp(marker));
}
assert.doesNotMatch(postinstallSqlCheck, /DROP\s+INDEX|CREATE\s+INDEX|INSERT|UPDATE|DELETE/iu);

const planText = formatQianchuanPlatformVideoIdentityContractPlan(plan, {
  path: '/tmp/platform-video-plan.json', bytes: 3000, sha256: 'd'.repeat(64),
});
assert.match(planText, /new_indexes=2 redundant_indexes=2 dml_rows=0 postchecks=2/);
assert.doesNotMatch(planText, /CREATE UNIQUE INDEX|DROP INDEX/);

const driftedSources = { ...sources, identityLookup: `${sources.identityLookup}\n// drift` };
assert.throws(
  () => buildQianchuanPlatformVideoIdentityContractPlan({
    probe: precontract,
    probeArtifact,
    probeSha256: probeArtifact.sha256,
    sources: driftedSources,
  }),
  /source SHA-256 drifted/,
);
assert.throws(
  () => buildQianchuanPlatformVideoIdentityContractPlan({
    generatedAt: 'not-a-timestamp',
    probe: precontract,
    probeArtifact,
    probeSha256: probeArtifact.sha256,
    sources,
  }),
  /ISO-8601 UTC timestamp/,
);
const unsafePlan = structuredClone(plan);
unsafePlan.migrations.installCanonicalGuards.sql += '\nUPDATE ads.marketing_content_platform_videos SET asset_id = asset_id;';
assert.throws(
  () => validateQianchuanPlatformVideoIdentityContractPlan(unsafePlan),
  /unauthorized SQL statement/,
);
const identityDriftPlan = structuredClone(plan);
identityDriftPlan.decision.canonicalExternalVideoIdentity.push('asset_id');
assert.throws(
  () => validateQianchuanPlatformVideoIdentityContractPlan(identityDriftPlan),
  /decision is not supported/,
);

assert.deepEqual(parseQianchuanPlatformVideoIdentityContractPlanArgs([
  '--probe', '/tmp/platform-video-probe.json',
  `--probe-sha256=${'a'.repeat(64)}`,
  '--output', '/tmp/platform-video-plan.json',
]), {
  help: false,
  outputPath: '/tmp/platform-video-plan.json',
  probePath: '/tmp/platform-video-probe.json',
  probeSha256: 'a'.repeat(64),
});
for (const option of ['--apply', '--deploy', '--execute', '--json', '--repair', '--write-ledger']) {
  assert.throws(
    () => parseQianchuanPlatformVideoIdentityContractPlanArgs([option]),
    /not supported by the offline platform-video identity plan/,
  );
}

const offlineCommandSource = readFileSync(new URL(
  './content-assets-qianchuan-production-migration-platform-video-identity-contract-plan.mjs',
  import.meta.url,
), 'utf8');
assert.doesNotMatch(offlineCommandSource, /from ['"]pg['"]|DATABASE_URL|AIOS_QC_ALLOW_LIVE_READONLY/);
const readonlyCommandSource = readFileSync(new URL(
  './content-assets-qianchuan-production-migration-platform-video-identity-readonly-probe.mjs',
  import.meta.url,
), 'utf8');
assert.ok(
  readonlyCommandSource.indexOf('validateQianchuanPlatformVideoIdentityProbeSources({')
    < readonlyCommandSource.indexOf('new pg.Client({'),
  'source artifacts must be validated before constructing the PostgreSQL client',
);

console.log('[qianchuan-platform-video-identity-contract-plan-behavior] OK: global/fallback identity evidence, state-specific read-only rollback, canonical index-only plan, source pins, postchecks, and write denial passed.');
