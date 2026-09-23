#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  QIANCHUAN_P1C_CATALOG_MAPPINGS,
  qianchuanP1cCatalogMappingsForFamily,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-catalog-map.mjs';
import {
  parseQianchuanProductionMigrationP1cCatalogProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-catalog-probe-cli.mjs';
import {
  runQianchuanProductionMigrationP1cCatalogProbe,
  validateQianchuanProductionMigrationP1cCatalogProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-p1c-catalog-probe.mjs';
import { QIANCHUAN_P1C_LINEAGE_FAMILIES } from '../../lib/migrations/aios-qianchuan-production-migration-p1c-lineage.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function lineageEntry(version, family) {
  return {
    namespace: 'warehouse',
    version,
    checksum: sha256(version),
    relativePath: `etl/groland_postgres/sql/migrations/${version}__fixture.sql`,
    source: { bytes: 1, path: `${version}.sql`, sha256: sha256(version) },
    authoritativeClassification: 'unknown',
    schemaEvidenceState: family === 'explicit_relation_drop'
      ? 'schema_effects_present'
      : 'schema_effects_partial',
    executionEvidenceState: 'unknown',
    ledgerEvidenceState: 'ledger_missing',
    effects: { current: 1, satisfied: 1, unsatisfied: 0, superseded: 0 },
    unsupportedSignals: [],
    currentReviewWaveLabel: family === 'explicit_relation_drop' ? null : 'P1C',
    lineageFamily: family,
    lineageState: family === 'explicit_relation_drop'
      ? 'static_dependency_supersession_verified_execution_unknown'
      : 'manual_lineage_and_runtime_proof_required',
    requiredEvidence: [],
    staticSupersession: [],
    review: {
      decision: null,
      evidenceLinks: [],
      notes: null,
      reviewedAt: null,
      reviewer: null,
    },
  };
}

const lineageEntries = QIANCHUAN_P1C_LINEAGE_FAMILIES.flatMap((family) => (
  family.entries.map((entry) => lineageEntry(entry.version, family.family))
));
const lineage = {
  schemaVersion: 1,
  generatedAt: '2026-07-24T06:10:00.000Z',
  mode: 'offline_readonly_p1c_lineage_packet',
  sourceArtifacts: {
    manifest: { path: '/tmp/manifest.json', bytes: 1, sha256: 'a'.repeat(64) },
    p1: { path: '/tmp/p1.json', bytes: 1, sha256: 'b'.repeat(64) },
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
    entries: lineageEntries.length,
    staticDependencySupersessionEntries: 4,
    remainingP1cEntries: 13,
    sourceChecksumsVerified: lineageEntries.length,
    byFamily: {},
    byLineageState: {},
  },
  families: QIANCHUAN_P1C_LINEAGE_FAMILIES.map((family) => ({
    family: family.family,
    label: family.label,
    lineageState: family.lineageState,
    requiredEvidence: [...family.requiredEvidence],
    catalogMappings: qianchuanP1cCatalogMappingsForFamily(family.family),
    count: family.entries.length,
    entries: family.entries.map((entry) => `warehouse/${entry.version}`),
  })),
  entries: lineageEntries,
};
const lineageContent = `${JSON.stringify(lineage, null, 2)}\n`;
const lineageArtifact = {
  path: '/tmp/p1c-lineage.json',
  bytes: Buffer.byteLength(lineageContent),
  sha256: sha256(lineageContent),
};

const currentRelations = new Set(QIANCHUAN_P1C_CATALOG_MAPPINGS.relations.map((entry) => entry.current));
const currentRoutines = new Map(QIANCHUAN_P1C_CATALOG_MAPPINGS.routines.map((entry) => [entry.current, entry]));
const currentIndexes = new Map(QIANCHUAN_P1C_CATALOG_MAPPINGS.indexes.map((entry) => [entry.current, entry]));

class FakeClient {
  constructor({ failOn = null } = {}) {
    this.failOn = failOn;
    this.queries = [];
  }

  async query(sql, params = []) {
    this.queries.push({ params, sql });
    if (this.failOn && sql.includes(this.failOn)) throw new Error('fixture query failure');
    if (sql === 'BEGIN READ ONLY' || sql.startsWith('SET LOCAL') || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('aios_qianchuan_p1c:relations')) {
      return {
        rows: params[0].map((qualifiedName) => {
          const present = currentRelations.has(qualifiedName);
          const [schemaName, relationName] = qualifiedName.split('.');
          return {
            qualified_name: qualifiedName,
            oid: present ? '1' : null,
            schema_name: present ? schemaName : null,
            relation_name: present ? relationName : null,
            relation_kind: present ? 'r' : null,
            total_bytes: present ? '8192' : null,
            estimated_rows: present ? '1' : null,
          };
        }),
      };
    }
    if (sql.includes('aios_qianchuan_p1c:routines')) {
      return {
        rows: params[0].map((signature) => {
          const mapping = currentRoutines.get(signature);
          return {
            signature,
            oid: mapping ? '1' : null,
            schema_name: mapping ? 'ads' : null,
            routine_name: mapping ? signature.split(/[.(]/)[1] : null,
            routine_kind: mapping ? 'p' : null,
            identity_arguments: mapping ? signature.slice(signature.indexOf('(') + 1, -1) : null,
            definition: mapping
              ? `CREATE PROCEDURE ${signature} ${mapping.currentDefinitionNeedles.join(' ')}`
              : null,
          };
        }),
      };
    }
    if (sql.includes('aios_qianchuan_p1c:indexes')) {
      return {
        rows: params[0].map((qualifiedName) => {
          const mapping = currentIndexes.get(qualifiedName);
          const [tableSchema, tableName] = mapping?.currentTable.split('.') ?? [];
          return {
            qualified_name: qualifiedName,
            oid: mapping ? '1' : null,
            schema_name: mapping ? 'ads' : null,
            index_name: mapping ? qualifiedName.split('.')[1] : null,
            table_schema: tableSchema ?? null,
            table_name: tableName ?? null,
            definition: mapping ? `CREATE INDEX ${qualifiedName.split('.')[1]}` : null,
          };
        }),
      };
    }
    if (sql.includes('aios_qianchuan_p1c:columns')) {
      return {
        rows: params[0].map((qualifiedName) => ({
          qualified_name: qualifiedName,
          attnum: 1,
          attname: 'id',
          data_type: 'bigint',
          attnotnull: true,
        })),
      };
    }
    if (sql.includes('aios_qianchuan_p1c:row_counts')) {
      return {
        rows: [...currentRelations].map((qualifiedName) => ({
          qualified_name: qualifiedName,
          row_count: '1',
        })),
      };
    }
    throw new Error(`Unexpected fixture SQL: ${sql.slice(0, 80)}`);
  }
}

function assertReadOnlyQueries(client) {
  const forbidden = /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|PERFORM|COMMIT|pg_advisory_lock|baseline|apply|Ark)\b/i;
  for (const { sql } of client.queries) {
    const allowed = sql === 'BEGIN READ ONLY'
      || sql === 'ROLLBACK'
      || /^SET LOCAL statement_timeout = '\d+ms'$/.test(sql)
      || /^\/\*[\s\S]*?\*\/\s*(?:SELECT|WITH)\b/i.test(sql);
    assert.equal(allowed, true, `unexpected SQL outside the read-only allowlist: ${sql}`);
    if (sql !== 'BEGIN READ ONLY' && sql !== 'ROLLBACK') {
      assert.equal(forbidden.test(sql), false, `write-like SQL token found: ${sql}`);
    }
  }
}

const client = new FakeClient();
const result = await runQianchuanProductionMigrationP1cCatalogProbe({
  client,
  lineage,
  lineageArtifact,
  lineageSha256: lineageArtifact.sha256,
  now: () => new Date('2026-07-24T06:30:00.000Z'),
});
assert.equal(validateQianchuanProductionMigrationP1cCatalogProbe(result), result);
assert.equal(result.summary.mappedFamilies, 4);
assert.equal(result.summary.catalogTopologyCompleteFamilies, 4);
assert.equal(result.summary.dataShapeObservedFamilies, 4);
assert.equal(result.summary.ownerDecisionReady, false);
assert.ok(result.relations.filter((entry) => entry.old).every((entry) => entry.oldPresent === false));
assert.ok(result.relations.every((entry) => entry.currentPresent));
assert.ok(result.routines.every((entry) => entry.currentPresent && entry.definitionMatches));
assert.ok(result.indexes.every((entry) => entry.currentPresent && entry.currentTableMatches));
assert.ok(Object.values(result.rowCounts).every((rowCount) => rowCount === '1'));
assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(client);

await assert.rejects(
  runQianchuanProductionMigrationP1cCatalogProbe({
    client: new FakeClient(),
    lineage,
    lineageArtifact,
    lineageSha256: '0'.repeat(64),
  }),
  /lineage packet SHA-256 differs/,
);
await assert.rejects(
  runQianchuanProductionMigrationP1cCatalogProbe({
    client: new FakeClient(),
    lineage: {
      ...lineage,
      families: lineage.families.map((family, index) => (
        index === 1 ? { ...family, catalogMappings: { relations: [], routines: [], indexes: [] } } : family
      )),
    },
    lineageArtifact,
    lineageSha256: lineageArtifact.sha256,
  }),
  /catalog mappings differ/,
);
const failingClient = new FakeClient({ failOn: 'aios_qianchuan_p1c:routines' });
await assert.rejects(
  runQianchuanProductionMigrationP1cCatalogProbe({
    client: failingClient,
    lineage,
    lineageArtifact,
    lineageSha256: lineageArtifact.sha256,
  }),
  /fixture query failure/,
);
assert.equal(failingClient.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(failingClient);

assert.deepEqual(
  parseQianchuanProductionMigrationP1cCatalogProbeArgs([
    '--lineage', '/tmp/p1c.json',
    `--lineage-sha256=${'a'.repeat(64)}`,
    '--output=/tmp/probe.json',
    '--json',
  ]),
  {
    help: false,
    json: true,
    lineagePath: '/tmp/p1c.json',
    lineageSha256: 'a'.repeat(64),
    outputPath: '/tmp/probe.json',
  },
);
assert.throws(
  () => parseQianchuanProductionMigrationP1cCatalogProbeArgs(['--lineage', '/tmp/p1c.json']),
  /--lineage-sha256 is required/,
);
for (const option of ['--apply', '--baseline', '--deploy', '--write-ledger']) {
  assert.throws(
    () => parseQianchuanProductionMigrationP1cCatalogProbeArgs([option]),
    /Unknown qianchuan migration P1C catalog probe option/,
  );
}

console.log('[qianchuan-production-migration-p1c-catalog-probe-behavior] OK: pinned lineage, 4-family catalog topology, routine hashes, exact row counts, SQL safety, rollback, and write denial passed.');
