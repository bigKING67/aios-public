import path from 'node:path';

import {
  AIOS_MIGRATION_LEDGER_EXCEPTION_KINDS,
  AIOS_MIGRATION_LEDGER_V2_EXECUTION_MODES,
} from './aios-migration-ledger-contract.mjs';
import { validateAiosMigrationIdentity } from './aios-migration-safety.mjs';
import { assertPinnedMigrationReviewArtifact } from './aios-qianchuan-production-migration-review-decisions.mjs';

export const AIOS_MIGRATION_LEDGER_BOOTSTRAP_SOURCE_ARTIFACT_KEYS = Object.freeze([
  'bootstrapPlan',
  'exceptionOverlay',
  'ownerDecisions',
  'reconciliation',
]);

export const AIOS_MIGRATION_LEDGER_BOOTSTRAP_REPOSITORY_SOURCE_PATHS = Object.freeze({
  bootstrapSql: 'scripts/lib/migrations/aios-migration-ledger-bootstrap-sql.mjs',
  bootstrapWriter: 'scripts/lib/migrations/aios-migration-ledger-bootstrap-writer.mjs',
  canonicalDdl: 'scripts/config/migrations/aios-schema-migrations.sql',
  historyComparator: 'scripts/lib/migrations/aios-migration-history.mjs',
  ledgerContract: 'scripts/lib/migrations/aios-migration-ledger-contract.mjs',
  v1ToV2Ddl: 'scripts/config/migrations/aios-schema-migrations-v1-to-v2.sql',
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp with milliseconds.`);
  }
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value ?? {}).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} keys are incomplete or unexpected.`);
  }
}

function assertRepositorySource(metadata, expectedPath, label) {
  if (metadata?.path !== expectedPath
    || path.isAbsolute(metadata?.path ?? '')
    || !Number.isInteger(metadata?.bytes)
    || metadata.bytes < 1
    || !SHA256_PATTERN.test(metadata?.sha256 ?? '')) {
    throw new Error(`${label} repository source metadata is invalid.`);
  }
}

function normalizeLedgerRow(row, label) {
  const identity = validateAiosMigrationIdentity(`${row?.namespace ?? ''}/${row?.version ?? ''}`);
  if (!SHA256_PATTERN.test(row?.checksum ?? '')) {
    throw new Error(`${label} ${identity} requires an exact migration checksum.`);
  }
  if (typeof row?.appVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(row.appVersion)) {
    throw new Error(`${label} ${identity} has an invalid appVersion.`);
  }
  if (!AIOS_MIGRATION_LEDGER_V2_EXECUTION_MODES.includes(row?.executionMode)) {
    throw new Error(`${label} ${identity} has an invalid executionMode.`);
  }
  const isException = row.executionMode === 'exception';
  if (isException) {
    if (!AIOS_MIGRATION_LEDGER_EXCEPTION_KINDS.includes(row.exceptionKind)
      || !SHA256_PATTERN.test(row.decisionArtifactSha256 ?? '')) {
      throw new Error(`${label} ${identity} has invalid exception metadata.`);
    }
  } else if (row?.exceptionKind != null || row?.decisionArtifactSha256 != null) {
    throw new Error(`${label} ${identity} carries exception metadata for a non-exception row.`);
  }
  return {
    namespace: row.namespace,
    version: row.version,
    checksum: row.checksum,
    appVersion: row.appVersion,
    executionMode: row.executionMode,
    exceptionKind: row.exceptionKind ?? null,
    decisionArtifactSha256: row.decisionArtifactSha256 ?? null,
  };
}

function normalizeRows(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} must be an array.`);
  const seen = new Set();
  return rows.map((row) => {
    const normalized = normalizeLedgerRow(row, label);
    const identity = `${normalized.namespace}/${normalized.version}`;
    if (seen.has(identity)) throw new Error(`${label} contains duplicate ${identity}.`);
    seen.add(identity);
    return normalized;
  });
}

export function validateAiosMigrationLedgerBootstrapManifest(manifest) {
  assertIsoTimestamp(manifest?.generatedAt, 'Migration ledger bootstrap manifest generatedAt');
  if (manifest?.schemaVersion !== 1
    || manifest.mode !== 'aios_migration_ledger_bootstrap_write_manifest') {
    throw new Error('Migration ledger bootstrap manifest identity is invalid.');
  }
  if (manifest.authorization?.reviewer !== 'repository-owner') {
    throw new Error('Migration ledger bootstrap manifest requires reviewer=repository-owner.');
  }
  assertIsoTimestamp(
    manifest.authorization?.reviewedAt,
    'Migration ledger bootstrap manifest reviewedAt',
  );
  if (manifest.authorization?.productionWritesAuthorized !== true
    || manifest.authorization?.ledgerWritesAuthorized !== true
    || manifest.authorization?.schemaUpgradeAuthorized !== true
    || manifest.authorization?.migrationApplyAuthorized !== false
    || manifest.authorization?.deployAuthorized !== false
    || manifest.authorization?.arkInvoked !== false) {
    throw new Error('Migration ledger bootstrap manifest authorization policy is invalid.');
  }
  if (!GIT_SHA_PATTERN.test(manifest.repository?.gitSha ?? '')
    || typeof manifest.repository?.appVersion !== 'string'
    || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(manifest.repository.appVersion)) {
    throw new Error('Migration ledger bootstrap manifest repository identity is invalid.');
  }
  if (!SHA256_PATTERN.test(manifest.database?.identitySha256 ?? '')) {
    throw new Error('Migration ledger bootstrap manifest requires a database identity SHA-256.');
  }
  assertExactKeys(
    manifest.sourceArtifacts,
    AIOS_MIGRATION_LEDGER_BOOTSTRAP_SOURCE_ARTIFACT_KEYS,
    'Migration ledger bootstrap source artifacts',
  );
  for (const key of AIOS_MIGRATION_LEDGER_BOOTSTRAP_SOURCE_ARTIFACT_KEYS) {
    const artifact = manifest.sourceArtifacts[key];
    assertPinnedMigrationReviewArtifact(
      artifact,
      artifact?.sha256,
      `Migration ledger bootstrap ${key}`,
    );
  }
  const repositorySourceEntries = Object.entries(
    AIOS_MIGRATION_LEDGER_BOOTSTRAP_REPOSITORY_SOURCE_PATHS,
  );
  assertExactKeys(
    manifest.repository.sources,
    repositorySourceEntries.map(([key]) => key),
    'Migration ledger bootstrap repository sources',
  );
  for (const [key, expectedPath] of repositorySourceEntries) {
    assertRepositorySource(
      manifest.repository.sources[key],
      expectedPath,
      `Migration ledger bootstrap ${key}`,
    );
  }
  if (!['missing', 'canonical-v1', 'canonical-v2'].includes(manifest.ledger?.expectedSchema)) {
    throw new Error('Migration ledger bootstrap expectedSchema is invalid.');
  }
  const existingRows = normalizeRows(manifest.ledger.existingRows, 'Bootstrap existingRows');
  const rowsToInsert = normalizeRows(manifest.ledger.rowsToInsert, 'Bootstrap rowsToInsert');
  const expectedRows = normalizeRows(manifest.ledger.expectedRows, 'Bootstrap expectedRows');
  if (expectedRows.length === 0) {
    throw new Error('Migration ledger bootstrap expectedRows must contain a resolved prefix.');
  }
  if (manifest.ledger.expectedSchema === 'missing' && existingRows.length !== 0) {
    throw new Error('A missing ledger cannot declare existing rows.');
  }
  if (manifest.ledger.expectedSchema === 'canonical-v1'
    && existingRows.some((row) => row.executionMode === 'exception')) {
    throw new Error('A canonical v1 ledger cannot contain exception rows.');
  }
  if (JSON.stringify(expectedRows) !== JSON.stringify([...existingRows, ...rowsToInsert])) {
    throw new Error('Migration ledger bootstrap expectedRows must equal existingRows plus rowsToInsert.');
  }
  const identities = expectedRows.map((row) => `${row.namespace}/${row.version}`);
  if (new Set(identities).size !== identities.length) {
    throw new Error('Migration ledger bootstrap expectedRows contain duplicate identities across inputs.');
  }
  return {
    ...manifest,
    ledger: {
      expectedSchema: manifest.ledger.expectedSchema,
      existingRows,
      rowsToInsert,
      expectedRows,
    },
  };
}
