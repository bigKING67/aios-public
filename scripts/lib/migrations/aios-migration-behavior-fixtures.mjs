import { assertAiosMigrationHistory, compareAiosMigrationHistory } from './aios-migration-history.mjs';
import {
  assertAiosMigrationLedgerSchema,
  AIOS_MIGRATION_LEDGER_V1_COLUMNS,
  AIOS_MIGRATION_LEDGER_V2_COLUMNS,
  detectAiosMigrationLedgerSchema,
} from './aios-migration-ledger-contract.mjs';
import { discoverAiosMigrations, summarizeAiosMigrations } from './aios-migration-discovery.mjs';
import {
  formatAiosMigrationResult,
  runAiosMigrationCommand,
} from './aios-migration-runner-core.mjs';
import {
  assertMigrationWriteAcknowledged,
  parseAiosMigrationArgs,
  redactMigrationText,
} from './aios-migration-safety.mjs';

const FIXTURE_DESCRIPTOR = Object.freeze({
  schemaVersion: 1,
  ledgerTable: 'public.aios_schema_migrations',
  advisoryLockKey: 'fixture-lock',
  namespaces: {
    backend: {
      directory: 'backend',
      versionPattern: '^(\\d{3})_.*\\.sql$',
      nonTransactionalVersions: ['003'],
    },
    warehouse: {
      directory: 'warehouse',
      versionPattern: '^(\\d{8}_\\d{4})__.*\\.sql$',
      nonTransactionalVersions: [],
    },
  },
});

const FIXTURE_FILES = Object.freeze({
  'backend/001_create.sql': 'CREATE TABLE fixture_one(id integer);',
  'backend/002_self.sql': 'BEGIN;\nCREATE TABLE fixture_two(id integer);\nCOMMIT;',
  'backend/003_concurrent.sql': 'CREATE INDEX CONCURRENTLY fixture_idx ON fixture_one(id);',
  'warehouse/20260722_1200__warehouse.sql': 'CREATE VIEW fixture_view AS SELECT 1;',
});

function informationSchemaRows(columns) {
  return columns.map((column) => ({
    column_name: column.columnName,
    data_type: column.dataType,
    is_nullable: column.nullable ? 'YES' : 'NO',
  }));
}

class FakeMigrationClient {
  constructor({
    failOn = '',
    ledgerColumns,
    ledgerExists = true,
    ledgerSchemaVersion = ledgerExists ? 1 : 0,
    rows = [],
  } = {}) {
    this.failOn = failOn;
    this.ledgerColumns = ledgerColumns;
    this.ledgerExists = ledgerExists;
    this.ledgerSchemaVersion = ledgerSchemaVersion;
    this.rows = rows.slice();
    this.queries = [];
  }

  async query(sql, params = []) {
    const text = String(sql);
    this.queries.push({ sql: text, params });
    if (this.failOn && text.includes(this.failOn)) throw new Error(`query failed for ${this.failOn}`);
    if (text.includes('FROM information_schema.columns')) {
      if (!this.ledgerExists) return { rows: [] };
      const columns = this.ledgerColumns ?? (
        this.ledgerSchemaVersion === 2
          ? AIOS_MIGRATION_LEDGER_V2_COLUMNS
          : AIOS_MIGRATION_LEDGER_V1_COLUMNS
      );
      return { rows: informationSchemaRows(columns) };
    }
    if (text.includes('CREATE TABLE IF NOT EXISTS public.aios_schema_migrations')) {
      this.ledgerExists = true;
      this.ledgerSchemaVersion = 2;
      return { rows: [] };
    }
    if (text.includes('FROM public.aios_schema_migrations')) {
      if (!this.ledgerExists) {
        const error = new Error('relation does not exist');
        error.code = '42P01';
        throw error;
      }
      return { rows: this.rows.slice() };
    }
    if (text.includes('INSERT INTO public.aios_schema_migrations')) {
      const row = {
        namespace: params[0],
        version: params[1],
        checksum: params[2],
        app_version: params[3],
        execution_mode: params[4],
        exception_kind: null,
        decision_artifact_sha256: null,
        applied_at: String(this.rows.length + 1).padStart(4, '0'),
      };
      this.rows.push(row);
      return { rowCount: 1, rows: [row] };
    }
    return { rows: [] };
  }
}

function fixtureRecords(descriptor = FIXTURE_DESCRIPTOR) {
  return discoverAiosMigrations({
    descriptor,
    readDirectory: (directory) => Object.keys(FIXTURE_FILES)
      .filter((file) => file.startsWith(`${directory}/`))
      .map((file) => file.slice(directory.length + 1)),
    readFile: (filePath) => FIXTURE_FILES[filePath],
  });
}

function targetedApplyOptions({ client, records, targetIdentity }) {
  return {
    appVersion: '2.3.409',
    client,
    command: 'apply',
    confirmed: true,
    descriptor: FIXTURE_DESCRIPTOR,
    readMigration: (filePath) => FIXTURE_FILES[filePath],
    records,
    targetIdentity,
    writeAck: 'apply',
  };
}

function queriedSql(client) {
  return client.queries.map((query) => query.sql).join('\n');
}

function ledgerRow(record, overrides = {}) {
  return {
    namespace: record.namespace,
    version: record.version,
    checksum: record.checksum,
    applied_at: overrides.applied_at ?? '0001',
    app_version: overrides.app_version ?? '2.3.414',
    execution_mode: overrides.execution_mode ?? record.executionMode,
    exception_kind: overrides.exception_kind ?? null,
    decision_artifact_sha256: overrides.decision_artifact_sha256 ?? null,
  };
}

function legacyPrefixFailures(records, rows) {
  const failures = [];
  for (const [index, row] of rows.entries()) {
    if (records[index]?.version !== row.version || records[index]?.checksum !== row.checksum) {
      failures.push(row.version);
    }
  }
  return failures;
}

async function captureAsyncError(callback) {
  try {
    await callback();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function captureError(callback) {
  try {
    callback();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function runAiosMigrationBehaviorFixtures({
  assertDeepEqual,
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  assertTrue,
}) {
  const records = fixtureRecords();
  const missingSchema = detectAiosMigrationLedgerSchema([]);
  assertEqual(missingSchema.status, 'missing', 'absent ledger columns should report missing schema');
  const v1Schema = detectAiosMigrationLedgerSchema(
    informationSchemaRows(AIOS_MIGRATION_LEDGER_V1_COLUMNS),
  );
  assertEqual(
    v1Schema.status,
    'read-compatible-v1',
    'the current ledger shape should remain read-compatible v1',
  );
  assertTrue(v1Schema.schemaUpgradeRequired, 'v1 read shape should report the future v2 upgrade requirement');
  const v2Schema = detectAiosMigrationLedgerSchema(
    informationSchemaRows(AIOS_MIGRATION_LEDGER_V2_COLUMNS),
  );
  assertEqual(
    v2Schema.status,
    'read-compatible-v2',
    'the additive exception-capable shape should be recognized as read-compatible v2',
  );
  assertTrue(v2Schema.supportsExceptions, 'v2 read shape should expose exception support');
  const driftedColumns = [...AIOS_MIGRATION_LEDGER_V2_COLUMNS, {
    columnName: 'unexpected',
    dataType: 'text',
    nullable: true,
  }];
  assertIncludes(
    captureError(() => assertAiosMigrationLedgerSchema(informationSchemaRows(driftedColumns))),
    'Migration ledger schema drift',
    'unknown ledger columns should fail before row reads',
  );
  const wrongTypeColumns = AIOS_MIGRATION_LEDGER_V1_COLUMNS.map((column) => (
    column.columnName === 'checksum' ? { ...column, dataType: 'character varying' } : column
  ));
  assertIncludes(
    captureError(() => assertAiosMigrationLedgerSchema(informationSchemaRows(wrongTypeColumns))),
    'Migration ledger schema drift',
    'ledger column type drift should fail before row reads',
  );
  assertDeepEqual(
    records.map((record) => record.executionMode),
    ['transactional', 'self-transactional', 'nontransactional', 'transactional'],
    'migration discovery should distinguish all transaction modes',
  );
  assertTrue(records.every((record) => /^[a-f0-9]{64}$/.test(record.checksum)), 'every migration should have a SHA-256 checksum');
  assertEqual(summarizeAiosMigrations(records).backend.total, 3, 'migration summary should retain namespace totals');

  const unsafeDescriptor = structuredClone(FIXTURE_DESCRIPTOR);
  unsafeDescriptor.namespaces.backend.nonTransactionalVersions = [];
  assertIncludes(
    captureError(() => fixtureRecords(unsafeDescriptor)),
    'CONCURRENTLY requires an explicit nonTransactionalVersions descriptor entry',
    'concurrent SQL should fail unless the descriptor owns the exception',
  );

  const firstApplied = records.slice(0, 1).map((record) => ({ ...record, applied_at: '0001' }));
  const comparison = compareAiosMigrationHistory(records, firstApplied);
  assertEqual(comparison.summaries.find((item) => item.namespace === 'backend').pending, 2, 'history comparison should expose pending backend migrations');
  assertIncludes(
    captureError(() => assertAiosMigrationHistory(records, [{ ...firstApplied[0], checksum: '0'.repeat(64) }])),
    'checksum drift for 001',
    'checksum drift must fail closed',
  );
  assertIncludes(
    captureError(() => assertAiosMigrationHistory(records, [{ ...records[1], applied_at: '0001' }])),
    'ledger history is not a filesystem prefix',
    'non-prefix history must fail closed',
  );
  assertIncludes(
    captureError(() => assertAiosMigrationHistory(records, [firstApplied[0], firstApplied[0]])),
    'duplicate ledger version',
    'duplicate ledger rows must fail closed',
  );

  const [backendOne, backendTwo, backendThree] = records.filter(
    (record) => record.namespace === 'backend',
  );
  const v2PrefixRows = [
    ledgerRow(backendOne, {
      execution_mode: 'exception',
      exception_kind: 'not_applicable',
      decision_artifact_sha256: 'a'.repeat(64),
    }),
    ledgerRow(backendTwo, { applied_at: '0002', execution_mode: 'baseline' }),
    ledgerRow(backendThree, { applied_at: '0003' }),
  ];
  const v2Comparison = assertAiosMigrationHistory(records, v2PrefixRows, {
    ledgerSchemaVersion: 2,
  });
  const v2BackendSummary = v2Comparison.summaries.find((item) => item.namespace === 'backend');
  assertDeepEqual(
    {
      baselined: v2BackendSummary.baselined,
      excepted: v2BackendSummary.excepted,
      executed: v2BackendSummary.executed,
      resolved: v2BackendSummary.resolved,
    },
    { baselined: 1, excepted: 1, executed: 1, resolved: 3 },
    'v2 history should separate executed, baselined, and exception resolutions',
  );
  assertDeepEqual(
    legacyPrefixFailures(records.filter((record) => record.namespace === 'backend'), v2PrefixRows),
    [],
    'an old prefix comparator should still align additive v2 exception rows by identity and checksum',
  );
  assertTrue(
    v2PrefixRows[0].execution_mode !== backendOne.executionMode,
    'an old targeted apply mode check should reject an exception-resolved migration',
  );
  assertIncludes(
    captureError(() => assertAiosMigrationHistory(records, v2PrefixRows, {
      ledgerSchemaVersion: 1,
    })),
    'exception mode requires the v2 ledger read shape',
    'v1 ledgers must reject exception rows',
  );
  assertIncludes(
    captureError(() => assertAiosMigrationHistory(records, [
      ledgerRow(backendOne, {
        execution_mode: 'exception',
        exception_kind: 'not_applicable',
      }),
    ], { ledgerSchemaVersion: 2 })),
    'invalid exception metadata',
    'exception rows must pin an owner decision artifact SHA',
  );
  assertIncludes(
    captureError(() => assertAiosMigrationHistory(records, [
      ledgerRow(backendOne, { exception_kind: 'not_applicable' }),
    ], { ledgerSchemaVersion: 2 })),
    'non-exception row has exception metadata',
    'ordinary rows must not carry exception metadata',
  );
  assertIncludes(
    captureError(() => assertAiosMigrationHistory(records, [
      ledgerRow(backendOne, { execution_mode: 'self-transactional' }),
    ], { ledgerSchemaVersion: 2 })),
    'execution mode drift',
    'executed rows must match the filesystem-declared execution mode',
  );

  assertIncludes(
    captureError(() => assertMigrationWriteAcknowledged({ command: 'apply', confirmed: true, writeAck: '' })),
    'AIOS_MIGRATION_WRITE_ACK=apply',
    'apply should require a second acknowledgement',
  );
  assertIncludes(
    captureError(() => parseAiosMigrationArgs(['destroy'])),
    'Unsupported migration command: destroy',
    'unsupported commands should fail before any database client is created',
  );
  assertIncludes(
    captureError(() => parseAiosMigrationArgs(['plan', '--confirm-apply'])),
    'Unknown migration option(s) for plan',
    'command-specific options should fail closed',
  );
  assertDeepEqual(
    parseAiosMigrationArgs(['verify', '--require-clean']),
    { command: 'verify', confirmed: false, requireNoPending: true },
    'verify should expose its read-only clean-history option',
  );
  assertDeepEqual(
    parseAiosMigrationArgs(['apply', '--only', 'warehouse/20260722_1200', '--confirm-apply']),
    {
      command: 'apply',
      confirmed: true,
      requireNoPending: false,
      targetIdentity: 'warehouse/20260722_1200',
    },
    'apply should parse one exact migration target',
  );
  assertIncludes(
    captureError(() => parseAiosMigrationArgs(['apply', '--only'])),
    '--only requires <namespace>/<version>',
    'target selection should require an identity value',
  );
  assertIncludes(
    captureError(() => parseAiosMigrationArgs(['apply', '--only', 'warehouse'])),
    'expected <namespace>/<version>',
    'target selection should reject malformed identities',
  );
  assertIncludes(
    captureError(() => parseAiosMigrationArgs(['plan', '--only', 'warehouse/20260722_1200'])),
    'Unknown migration option(s) for plan',
    'read-only commands should reject target selection',
  );
  assertIncludes(
    captureError(() => parseAiosMigrationArgs([
      'apply',
      '--only',
      'warehouse/20260722_1200',
      '--only',
      'backend/001',
    ])),
    '--only may be provided only once',
    'target selection should reject duplicate identities',
  );
  assertEqual(
    redactMigrationText('failed to connect to postgres://admin:secret@db.local/app?password=hunter2'),
    'failed to connect to [redacted-database-url]',
    'the full database URL should be redacted',
  );

  const v1PlanClient = new FakeMigrationClient({ rows: [ledgerRow(backendOne)] });
  const v1Plan = await runAiosMigrationCommand({
    client: v1PlanClient,
    command: 'plan',
    descriptor: FIXTURE_DESCRIPTOR,
    records,
  });
  assertEqual(v1Plan.ledgerSchema.status, 'read-compatible-v1', 'plan should identify read-compatible v1 schema');
  assertEqual(v1PlanClient.queries.length, 2, 'v1 plan should use one schema query and one ledger query');
  assertIncludes(
    formatAiosMigrationResult(v1Plan),
    'ledger_schema=v1',
    'formatted plan output should expose the ledger schema version',
  );

  const v2PlanClient = new FakeMigrationClient({
    ledgerSchemaVersion: 2,
    rows: v2PrefixRows,
  });
  const v2Plan = await runAiosMigrationCommand({
    client: v2PlanClient,
    command: 'plan',
    descriptor: FIXTURE_DESCRIPTOR,
    records,
  });
  assertEqual(v2Plan.ledgerSchema.status, 'read-compatible-v2', 'plan should identify read-compatible v2 schema');
  assertEqual(v2PlanClient.queries.length, 2, 'v2 plan should keep database query count constant');
  assertIncludes(
    formatAiosMigrationResult(v2Plan),
    'backend=applied:3,resolved:3,executed:1,baselined:1,excepted:1',
    'formatted v2 output should separate resolution categories',
  );

  const missingPlanClient = new FakeMigrationClient({ ledgerExists: false });
  const missingPlan = await runAiosMigrationCommand({
    client: missingPlanClient,
    command: 'plan',
    descriptor: FIXTURE_DESCRIPTOR,
    records,
  });
  assertEqual(missingPlan.ledgerSchema.status, 'missing', 'plan should report a missing ledger read-only');
  assertEqual(missingPlanClient.queries.length, 1, 'missing-ledger plan should stop after schema discovery');
  assertNotIncludes(queriedSql(missingPlanClient), 'CREATE TABLE', 'read-only plan must not create the ledger');

  const driftedSchemaClient = new FakeMigrationClient({ ledgerColumns: driftedColumns });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand({
      client: driftedSchemaClient,
      command: 'plan',
      descriptor: FIXTURE_DESCRIPTOR,
      records,
    })),
    'Migration ledger schema drift',
    'plan should fail closed on unknown ledger columns',
  );
  assertEqual(driftedSchemaClient.queries.length, 1, 'schema drift should fail before reading ledger rows');

  const baselineClient = new FakeMigrationClient({ ledgerExists: false });
  const baselineResult = await runAiosMigrationCommand({
    appVersion: '2.3.388',
    client: baselineClient,
    command: 'baseline',
    confirmed: true,
    descriptor: FIXTURE_DESCRIPTOR,
    ledgerDdl: 'CREATE TABLE IF NOT EXISTS public.aios_schema_migrations ();',
    records,
    writeAck: 'baseline',
  });
  assertEqual(baselineResult.changed, 4, 'baseline should record every historical migration');
  assertEqual(
    baselineClient.ledgerSchemaVersion,
    2,
    'a newly created ledger should use the canonical additive v2 schema',
  );
  const baselineSql = baselineClient.queries.map((query) => query.sql).join('\n');
  assertNotIncludes(baselineSql, 'CREATE TABLE fixture_one', 'baseline must not execute historical migration bodies');
  assertIncludes(baselineSql, 'pg_advisory_lock', 'baseline should acquire the shared advisory lock');
  assertIncludes(baselineSql, 'pg_advisory_unlock', 'baseline should release the shared advisory lock');

  const applyClient = new FakeMigrationClient({ ledgerExists: true });
  const applyResult = await runAiosMigrationCommand({
    appVersion: '2.3.388',
    client: applyClient,
    command: 'apply',
    confirmed: true,
    descriptor: FIXTURE_DESCRIPTOR,
    ledgerDdl: 'CREATE TABLE IF NOT EXISTS public.aios_schema_migrations ();',
    readMigration: (filePath) => FIXTURE_FILES[filePath],
    records,
    writeAck: 'apply',
  });
  assertEqual(applyResult.changed, 4, 'apply should execute every pending migration once');
  const applySql = applyClient.queries.map((query) => query.sql.trim());
  assertNotIncludes(
    applySql.join('\n'),
    'CREATE TABLE IF NOT EXISTS public.aios_schema_migrations',
    'ordinary apply should not run canonical create DDL against an existing v1 ledger',
  );
  assertTrue(applySql.filter((sql) => sql === 'BEGIN').length >= 2, 'runner and self-managed files should preserve transaction boundaries');
  assertIncludes(applySql.join('\n'), 'CREATE INDEX CONCURRENTLY', 'declared nontransactional SQL should execute without being skipped');

  const targetRecord = records.find((record) => record.namespace === 'warehouse');
  const targetedClient = new FakeMigrationClient({ ledgerExists: true });
  const targetedResult = await runAiosMigrationCommand(targetedApplyOptions({
    client: targetedClient,
    records,
    targetIdentity: 'warehouse/20260722_1200',
  }));
  assertEqual(targetedResult.changed, 1, 'targeted apply should execute exactly one migration');
  assertDeepEqual(
    targetedResult.remainingPendingIdentities,
    ['backend/001', 'backend/002', 'backend/003'],
    'targeted apply should report every untouched pending migration',
  );
  assertEqual(targetedResult.target.identity, 'warehouse/20260722_1200', 'targeted apply should report the exact identity');
  assertEqual(targetedResult.target.checksum, targetRecord.checksum, 'targeted apply should report the exact checksum');
  assertEqual(targetedResult.target.state, 'applied', 'targeted apply should report the applied state');
  const targetedSql = queriedSql(targetedClient);
  assertIncludes(targetedSql, 'CREATE VIEW fixture_view', 'targeted apply should execute the selected body');
  assertNotIncludes(targetedSql, 'CREATE TABLE fixture_one', 'targeted apply should leave other namespaces untouched');
  assertNotIncludes(targetedSql, 'CREATE TABLE IF NOT EXISTS public.aios_schema_migrations', 'targeted apply should require an existing ledger');
  const formattedTargetedResult = formatAiosMigrationResult(targetedResult);
  assertIncludes(formattedTargetedResult, 'target=warehouse/20260722_1200', 'targeted output should include the identity');
  assertIncludes(formattedTargetedResult, `target_checksum=${targetRecord.checksum}`, 'targeted output should include the checksum');
  assertIncludes(formattedTargetedResult, 'remaining_pending=3', 'targeted output should include untouched pending count');

  const unknownTargetClient = new FakeMigrationClient({ ledgerExists: true });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: unknownTargetClient,
      records,
      targetIdentity: 'warehouse/20990101_0000',
    }))),
    'Unknown migration target',
    'unknown targets should fail before database access',
  );
  assertEqual(unknownTargetClient.queries.length, 0, 'unknown targets should not query the database');

  const duplicateTargetClient = new FakeMigrationClient({ ledgerExists: true });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: duplicateTargetClient,
      records: [...records, targetRecord],
      targetIdentity: 'warehouse/20260722_1200',
    }))),
    'Duplicate migration target',
    'duplicate inventory identities should fail before database access',
  );
  assertEqual(duplicateTargetClient.queries.length, 0, 'duplicate targets should not query the database');

  const nontransactionalTargetClient = new FakeMigrationClient({ ledgerExists: true });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: nontransactionalTargetClient,
      records,
      targetIdentity: 'backend/003',
    }))),
    'supports transactional migrations only',
    'targeted apply should reject nontransactional bodies before database access',
  );
  assertEqual(nontransactionalTargetClient.queries.length, 0, 'unsafe target modes should not query the database');

  const selfTransactionalTargetClient = new FakeMigrationClient({ ledgerExists: true });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: selfTransactionalTargetClient,
      records,
      targetIdentity: 'backend/002',
    }))),
    'uses self-transactional',
    'targeted apply should reject self-managed transaction bodies',
  );
  assertEqual(selfTransactionalTargetClient.queries.length, 0, 'self-managed targets should not query the database');

  const missingTargetLedgerClient = new FakeMigrationClient({ ledgerExists: false });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: missingTargetLedgerClient,
      records,
      targetIdentity: 'warehouse/20260722_1200',
    }))),
    'targeted apply requires an authorized ledger bootstrap first',
    'targeted apply should not create a missing ledger',
  );
  const missingTargetLedgerSql = queriedSql(missingTargetLedgerClient);
  assertNotIncludes(missingTargetLedgerSql, 'CREATE TABLE IF NOT EXISTS', 'missing target ledger should fail without DDL');
  assertNotIncludes(missingTargetLedgerSql, 'CREATE VIEW fixture_view', 'missing target ledger should fail before the migration body');

  const laterTargetRecord = {
    ...targetRecord,
    version: '20260723_1200',
    file: '20260723_1200__warehouse_next.sql',
    relativePath: 'warehouse/20260723_1200__warehouse_next.sql',
    checksum: '1'.repeat(64),
  };
  const predecessorRecords = [...records, laterTargetRecord];
  const predecessorClient = new FakeMigrationClient({ ledgerExists: true });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: predecessorClient,
      records: predecessorRecords,
      targetIdentity: 'warehouse/20260723_1200',
    }))),
    'predecessor warehouse/20260722_1200 remains pending',
    'targeted apply should preserve namespace prefix order',
  );
  assertNotIncludes(
    queriedSql(predecessorClient),
    'CREATE VIEW fixture_view',
    'unresolved predecessors should block the target body',
  );

  const appliedTargetClient = new FakeMigrationClient({
    ledgerExists: true,
    rows: [{ ...targetRecord, applied_at: '0001', execution_mode: 'transactional' }],
  });
  const appliedTargetResult = await runAiosMigrationCommand(targetedApplyOptions({
    client: appliedTargetClient,
    records,
    targetIdentity: 'warehouse/20260722_1200',
  }));
  assertEqual(appliedTargetResult.changed, 0, 'same-checksum applied targets should be idempotent');
  assertEqual(appliedTargetResult.target.state, 'already-applied', 'idempotent target state should be explicit');
  assertNotIncludes(
    queriedSql(appliedTargetClient),
    'CREATE VIEW fixture_view',
    'already applied targets should not replay the body',
  );

  const baselinedTargetClient = new FakeMigrationClient({
    ledgerExists: true,
    rows: [{ ...targetRecord, applied_at: '0001', execution_mode: 'baseline' }],
  });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: baselinedTargetClient,
      records,
      targetIdentity: 'warehouse/20260722_1200',
    }))),
    'Targeted apply will not replay baseline or mode-drifted history',
    'baselined targets should not be reported as body-applied or replayed',
  );
  assertNotIncludes(
    queriedSql(baselinedTargetClient),
    'CREATE VIEW fixture_view',
    'baselined targets should fail without replaying the body',
  );

  const exceptionTargetRow = ledgerRow(targetRecord, {
    execution_mode: 'exception',
    exception_kind: 'not_applicable',
    decision_artifact_sha256: 'b'.repeat(64),
  });
  const exceptionTargetClient = new FakeMigrationClient({
    ledgerSchemaVersion: 2,
    rows: [exceptionTargetRow],
  });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: exceptionTargetClient,
      records,
      targetIdentity: 'warehouse/20260722_1200',
    }))),
    'target is exception-resolved; replay prohibited',
    'targeted apply should explicitly reject exception-resolved history',
  );
  assertNotIncludes(
    queriedSql(exceptionTargetClient),
    'CREATE VIEW fixture_view',
    'exception-resolved targets should never replay the migration body',
  );

  const applyAfterExceptionClient = new FakeMigrationClient({
    ledgerSchemaVersion: 2,
    rows: [exceptionTargetRow],
  });
  const applyAfterException = await runAiosMigrationCommand({
    appVersion: '2.3.414',
    client: applyAfterExceptionClient,
    command: 'apply',
    confirmed: true,
    descriptor: FIXTURE_DESCRIPTOR,
    ledgerDdl: 'CREATE TABLE IF NOT EXISTS public.aios_schema_migrations ();',
    readMigration: (filePath) => FIXTURE_FILES[filePath],
    records,
    writeAck: 'apply',
  });
  assertEqual(applyAfterException.changed, 3, 'ordinary apply should begin after the v2 exception prefix');
  assertEqual(
    applyAfterException.comparison.summaries.find((item) => item.namespace === 'warehouse').excepted,
    1,
    'ordinary apply should retain exception resolution accounting',
  );
  assertNotIncludes(
    queriedSql(applyAfterExceptionClient),
    'CREATE VIEW fixture_view',
    'ordinary apply should skip exception-resolved migration bodies',
  );

  const driftedTargetClient = new FakeMigrationClient({
    ledgerExists: true,
    rows: [{ ...targetRecord, checksum: '0'.repeat(64), applied_at: '0001' }],
  });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: driftedTargetClient,
      records,
      targetIdentity: 'warehouse/20260722_1200',
    }))),
    'checksum drift',
    'targeted apply should reject an applied checksum mismatch',
  );

  const failingTargetClient = new FakeMigrationClient({ failOn: 'fixture_view', ledgerExists: true });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: failingTargetClient,
      records,
      targetIdentity: 'warehouse/20260722_1200',
    }))),
    'query failed for fixture_view',
    'target migration errors should propagate',
  );
  assertTrue(
    failingTargetClient.queries.some((query) => query.sql.trim() === 'ROLLBACK'),
    'target migration errors should roll back the body and ledger transaction',
  );

  const failingTargetLedgerClient = new FakeMigrationClient({
    failOn: 'INSERT INTO public.aios_schema_migrations',
    ledgerExists: true,
  });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand(targetedApplyOptions({
      client: failingTargetLedgerClient,
      records,
      targetIdentity: 'warehouse/20260722_1200',
    }))),
    'query failed for INSERT INTO public.aios_schema_migrations',
    'target ledger errors should propagate',
  );
  assertTrue(
    failingTargetLedgerClient.queries.some((query) => query.sql.trim() === 'ROLLBACK'),
    'target ledger errors should roll back the migration body',
  );

  const failingClient = new FakeMigrationClient({ failOn: 'fixture_one', ledgerExists: true });
  const applyError = await captureAsyncError(() => runAiosMigrationCommand({
    appVersion: '2.3.388',
    client: failingClient,
    command: 'apply',
    confirmed: true,
    descriptor: FIXTURE_DESCRIPTOR,
    ledgerDdl: 'CREATE TABLE IF NOT EXISTS public.aios_schema_migrations ();',
    readMigration: (filePath) => FIXTURE_FILES[filePath],
    records,
    writeAck: 'apply',
  }));
  assertIncludes(applyError, 'query failed for fixture_one', 'migration query errors should propagate');
  const failingSql = failingClient.queries.map((query) => query.sql.trim());
  assertTrue(failingSql.includes('ROLLBACK'), 'transactional migration failure should roll back');
  assertIncludes(failingSql.join('\n'), 'pg_advisory_unlock', 'advisory lock should release after failure');

  const missingLedgerClient = new FakeMigrationClient({ ledgerExists: false });
  assertIncludes(
    await captureAsyncError(() => runAiosMigrationCommand({
      appVersion: '2.3.388',
      client: missingLedgerClient,
      command: 'verify',
      descriptor: FIXTURE_DESCRIPTOR,
      records,
    })),
    'Migration ledger is missing',
    'verify should not silently treat a missing ledger as valid history',
  );

  const largeRecords = Array.from({ length: 10_000 }, (_, index) => ({
    namespace: 'warehouse',
    version: String(index + 1).padStart(8, '0'),
    checksum: (index + 1).toString(16).padStart(64, '0'),
    executionMode: 'transactional',
  }));
  const largeClient = new FakeMigrationClient({
    ledgerSchemaVersion: 2,
    rows: largeRecords.map((record, index) => ledgerRow(record, {
      applied_at: String(index + 1).padStart(8, '0'),
    })),
  });
  const largePlan = await runAiosMigrationCommand({
    client: largeClient,
    command: 'plan',
    descriptor: FIXTURE_DESCRIPTOR,
    records: largeRecords,
  });
  assertEqual(
    largePlan.comparison.summaries[0].resolved,
    largeRecords.length,
    'large history should validate every row without changing semantics',
  );
  assertEqual(
    largeClient.queries.length,
    2,
    'large history should retain constant database query count instead of N+1 reads',
  );

  return `${records.length} fixture migrations plus 10000-row bounded-query history; v1/v2/exception/apply/rollback passed`;
}
