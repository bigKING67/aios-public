import { readFileSync } from 'node:fs';

import { assertAiosMigrationHistory } from './aios-migration-history.mjs';
import {
  assertAiosMigrationLedgerSchema,
  AIOS_MIGRATION_LEDGER_SCHEMA_SQL,
  aiosMigrationLedgerSelectSql,
  formatAiosMigrationLedgerSchema,
} from './aios-migration-ledger-contract.mjs';
import { assertMigrationWriteAcknowledged } from './aios-migration-safety.mjs';

const LEDGER_INSERT_SQL = `
INSERT INTO public.aios_schema_migrations (
  namespace, version, checksum, app_version, execution_mode
)
VALUES ($1, $2, $3, $4, $5)
RETURNING namespace, version, checksum
`;

function isUndefinedTable(error) {
  return error?.code === '42P01';
}

async function readLedger(client) {
  const schemaResult = await client.query(AIOS_MIGRATION_LEDGER_SCHEMA_SQL);
  const schema = assertAiosMigrationLedgerSchema(schemaResult.rows ?? []);
  if (!schema.exists) return { exists: false, rows: [], schema };
  try {
    const result = await client.query(aiosMigrationLedgerSelectSql(schema.version));
    return { exists: true, rows: result.rows ?? [], schema };
  } catch (error) {
    if (isUndefinedTable(error)) {
      throw new Error('Migration ledger changed after schema inspection; retry from a stable database state.');
    }
    throw error;
  }
}

async function insertLedgerRecord(client, record, appVersion, executionMode) {
  const result = await client.query(LEDGER_INSERT_SQL, [
    record.namespace,
    record.version,
    record.checksum,
    appVersion,
    executionMode,
  ]);
  const inserted = result.rows?.[0];
  if (
    result.rowCount !== 1
    || inserted?.namespace !== record.namespace
    || inserted?.version !== record.version
    || inserted?.checksum !== record.checksum
  ) {
    throw new Error(`Migration ledger insert was not acknowledged for ${migrationIdentity(record)}.`);
  }
}

async function withAdvisoryLock(client, lockKey, callback) {
  await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockKey]);
  try {
    return await callback();
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
  }
}

async function baselinePending(client, pendingRecords, appVersion) {
  await client.query('BEGIN');
  try {
    for (const record of pendingRecords) {
      await insertLedgerRecord(client, record, appVersion, 'baseline');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function applyTransactional(client, record, appVersion, migrationSql) {
  await client.query('BEGIN');
  try {
    await client.query(migrationSql);
    await insertLedgerRecord(client, record, appVersion, record.executionMode);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function applyPending(client, pendingRecords, appVersion, readMigration) {
  for (const record of pendingRecords) {
    const migrationSql = readMigration(record.relativePath, 'utf8');
    if (record.executionMode === 'transactional') {
      await applyTransactional(client, record, appVersion, migrationSql);
      continue;
    }
    await client.query(migrationSql);
    await insertLedgerRecord(client, record, appVersion, record.executionMode);
  }
}

function pendingRecords(comparison) {
  return comparison.summaries.flatMap((summary) => summary.pendingRecords);
}

function migrationIdentity(record) {
  return `${record.namespace}/${record.version}`;
}

function remainingPendingIdentities(comparison) {
  return pendingRecords(comparison).map(migrationIdentity);
}

export function resolveAiosMigrationTarget(records, targetIdentity) {
  if (!targetIdentity) return null;
  const matches = records.filter((record) => migrationIdentity(record) === targetIdentity);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Unknown migration target: ${targetIdentity}.`
        : `Duplicate migration target: ${targetIdentity}.`,
    );
  }
  const [record] = matches;
  if (record.executionMode !== 'transactional') {
    throw new Error(
      `Targeted apply supports transactional migrations only; ${targetIdentity} uses ${record.executionMode}.`,
    );
  }
  return record;
}

function targetedResult({ command, comparison, ledger, record, state, changed }) {
  return {
    command,
    ledgerExists: ledger.exists,
    ledgerSchema: ledger.schema,
    comparison,
    changed,
    target: {
      identity: migrationIdentity(record),
      checksum: record.checksum,
      state,
    },
    remainingPendingIdentities: remainingPendingIdentities(comparison),
  };
}

export async function runAiosMigrationCommand({
  appVersion,
  client,
  command,
  confirmed = false,
  descriptor,
  ledgerDdl = readFileSync('scripts/config/migrations/aios-schema-migrations.sql', 'utf8'),
  readMigration = readFileSync,
  records,
  requireNoPending = false,
  targetIdentity,
  writeAck = '',
}) {
  if (!['plan', 'verify', 'baseline', 'apply'].includes(command)) {
    throw new Error(`Unsupported migration command: ${command}.`);
  }
  if (targetIdentity && command !== 'apply') {
    throw new Error('Migration target selection is supported only for apply.');
  }
  const targetRecord = resolveAiosMigrationTarget(records, targetIdentity);
  assertMigrationWriteAcknowledged({ command, confirmed, writeAck });

  if (command === 'plan' || command === 'verify') {
    const ledger = await readLedger(client);
    if (command === 'verify' && !ledger.exists) {
      throw new Error('Migration ledger is missing; run an explicitly authorized baseline first.');
    }
    const comparison = assertAiosMigrationHistory(records, ledger.rows, {
      ledgerSchemaVersion: ledger.schema.version,
      requireNoPending: command === 'verify' && requireNoPending,
    });
    return {
      command,
      ledgerExists: ledger.exists,
      ledgerSchema: ledger.schema,
      comparison,
      changed: 0,
    };
  }

  return withAdvisoryLock(client, descriptor.advisoryLockKey, async () => {
    if (targetRecord) {
      const ledger = await readLedger(client);
      if (!ledger.exists) {
        throw new Error('Migration ledger is missing; targeted apply requires an authorized ledger bootstrap first.');
      }
      const comparison = assertAiosMigrationHistory(records, ledger.rows, {
        ledgerSchemaVersion: ledger.schema.version,
      });
      const appliedRow = ledger.rows.find((row) => (
        row.namespace === targetRecord.namespace && row.version === targetRecord.version
      ));
      if (appliedRow) {
        if (appliedRow.execution_mode === 'exception') {
          throw new Error(
            `Cannot apply ${targetIdentity}: target is exception-resolved; replay prohibited.`,
          );
        }
        if (appliedRow.execution_mode !== targetRecord.executionMode) {
          throw new Error(
            `Cannot apply ${targetIdentity}: ledger execution_mode=${appliedRow.execution_mode ?? 'missing'}; `
            + `expected ${targetRecord.executionMode}. Targeted apply will not replay baseline or mode-drifted history.`,
          );
        }
        return targetedResult({
          command,
          comparison,
          ledger,
          record: targetRecord,
          state: 'already-applied',
          changed: 0,
        });
      }
      const namespaceSummary = comparison.summaries.find(
        (summary) => summary.namespace === targetRecord.namespace,
      );
      const firstPending = namespaceSummary?.pendingRecords[0];
      if (!firstPending || migrationIdentity(firstPending) !== targetIdentity) {
        const predecessor = firstPending ? migrationIdentity(firstPending) : 'unknown';
        throw new Error(
          `Cannot apply ${targetIdentity}: predecessor ${predecessor} remains pending; `
          + '--only may apply only the first pending migration in a namespace.',
        );
      }
      const migrationSql = readMigration(targetRecord.relativePath, 'utf8');
      await applyTransactional(client, targetRecord, appVersion, migrationSql);
      const postLedger = await readLedger(client);
      const postComparison = assertAiosMigrationHistory(records, postLedger.rows, {
        ledgerSchemaVersion: postLedger.schema.version,
      });
      const postAppliedRow = postLedger.rows.find((row) => (
        row.namespace === targetRecord.namespace && row.version === targetRecord.version
      ));
      if (
        postAppliedRow?.checksum !== targetRecord.checksum
        || postAppliedRow?.execution_mode !== targetRecord.executionMode
      ) {
        throw new Error(`Targeted apply ledger verification failed for ${targetIdentity}.`);
      }
      return targetedResult({
        command,
        comparison: postComparison,
        ledger: postLedger,
        record: targetRecord,
        state: 'applied',
        changed: 1,
      });
    }
    let ledger = await readLedger(client);
    if (!ledger.exists) {
      await client.query(ledgerDdl);
      ledger = await readLedger(client);
    }
    const comparison = assertAiosMigrationHistory(records, ledger.rows, {
      ledgerSchemaVersion: ledger.schema.version,
    });
    const pending = pendingRecords(comparison);
    if (command === 'baseline') await baselinePending(client, pending, appVersion);
    else await applyPending(client, pending, appVersion, readMigration);
    return {
      command,
      ledgerExists: true,
      ledgerSchema: ledger.schema,
      comparison,
      changed: pending.length,
    };
  });
}

export function formatAiosMigrationResult(result) {
  const namespaceSummary = result.comparison.summaries
    .map((summary) => (
      `${summary.namespace}=applied:${summary.applied},resolved:${summary.resolved},`
      + `executed:${summary.executed},baselined:${summary.baselined},excepted:${summary.excepted},`
      + `pending:${summary.pending},total:${summary.total}`
    ))
    .join(' ');
  const targetSummary = result.target
    ? ` target=${result.target.identity} target_checksum=${result.target.checksum} target_state=${result.target.state}`
      + ` remaining_pending=${result.remainingPendingIdentities.length}`
    : '';
  const schema = formatAiosMigrationLedgerSchema(result.ledgerSchema);
  return `command=${result.command}${targetSummary} ledger=${result.ledgerExists ? 'present' : 'missing'} ledger_schema=${schema} changed=${result.changed} ${namespaceSummary}`;
}
