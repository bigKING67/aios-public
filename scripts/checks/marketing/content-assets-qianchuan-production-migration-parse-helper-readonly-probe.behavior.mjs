#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION,
  validateQianchuanParseHelperForwardMigrationSql,
} from '../../lib/migrations/aios-qianchuan-production-migration-parse-helper-forward-contract-plan.mjs';
import {
  formatQianchuanParseHelperReadonlyProbe,
  parseQianchuanParseHelperReadonlyProbeArgs,
} from '../../lib/migrations/aios-qianchuan-production-migration-parse-helper-readonly-probe-cli.mjs';
import {
  runQianchuanParseHelperReadonlyProbe,
  validateQianchuanParseHelperPostinstallReadonlyProbe,
  validateQianchuanParseHelperPreinstallReadonlyProbe,
} from '../../lib/migrations/aios-qianchuan-production-migration-parse-helper-readonly-probe.mjs';

const forwardMigrationSql = readFileSync(QIANCHUAN_PARSE_HELPER_FORWARD_MIGRATION.path, 'utf8');
const sqlRegressionCheck = readFileSync(
  'etl/groland_postgres/tests/sql/marketing_content_report_parse_helpers_check.sql',
  'utf8',
);
const migrationEvidence = validateQianchuanParseHelperForwardMigrationSql(forwardMigrationSql);
const planArtifact = {
  path: '/tmp/parse-helper-forward-contract-plan.json',
  bytes: 7525,
  sha256: 'a'.repeat(64),
};
const plan = {
  schemaVersion: 1,
  generatedAt: '2026-07-25T06:53:56.476Z',
  mode: 'offline_qianchuan_parse_helper_forward_contract_plan',
  target: {
    identity: 'warehouse/20260525_1730',
    checksum: migrationEvidence.sha256,
    source: 'etl/groland_postgres/sql/migrations/20260525_1730__add_marketing_content_report_parse_helpers.sql',
  },
  sourceArtifact: {
    path: '/tmp/p1d-owner-review-probe.json',
    bytes: 100,
    sha256: 'b'.repeat(64),
  },
  repositoryEvidence: {
    historicalMigration: {
      path: 'etl/groland_postgres/sql/migrations/20260525_1730__add_marketing_content_report_parse_helpers.sql',
      bytes: migrationEvidence.bytes,
      sha256: migrationEvidence.sha256,
    },
    runtime: {
      path: 'etl/groland_postgres/scripts/marketing_content_assets/qianchuan_reports.py',
      bytes: 20000,
      sha256: 'c'.repeat(64),
      selfProvisioningCallCount: 1,
      selfProvisioningDefinitionCount: 1,
      runtimeDdlFunctionCount: 3,
      dwdHelperCallsitesPreserved: true,
    },
  },
  policy: {
    networkAccess: false,
    productionWritesAuthorized: false,
    ledgerWritesAuthorized: false,
    migrationApplyAuthorized: false,
    runtimeTransitionAuthorized: false,
    ownerDecisionRecorded: false,
    deployAuthorized: false,
    arkInvoked: false,
    historicalMigrationReplayRecommended: false,
  },
  decision: {
    forwardContractPlanReady: true,
    recommendedStrategy: 'forward_migration_then_readonly_postcheck_then_remove_runtime_self_ddl',
  },
  observed: {
    helpersPresent: 0,
    rawRows: 0,
    dwdRows: 0,
    qianchuanDwdRows: 0,
  },
  execution: {
    phaseOrder: ['preflight', 'forward_migration', 'readonly_postcheck', 'runtime_transition', 'dormant_path_smoke'],
    preflight: { requireExactArtifactSha256: 'b'.repeat(64) },
    forwardMigration: {
      sql: forwardMigrationSql,
      definitionBytes: migrationEvidence.bytes,
      definitionSha256: migrationEvidence.sha256,
      functions: migrationEvidence.functions,
      historicalMigrationReplay: false,
      functionOnlyDdl: true,
      tableDmlAllowed: false,
    },
    readonlyPostcheck: { helpersPresent: 3, semanticChecks: ['numeric', 'bigint', 'rate'] },
    runtimeTransition: {
      applyOnlyAfterReadonlyPostcheck: true,
      sourceSha256: 'c'.repeat(64),
      removeRuntimeDdlFunctions: 3,
      preserveDwdHelperCallsites: true,
      eliminateOutOfBandCommit: true,
    },
    dormantPathSmoke: { productionImportAuthorized: false },
  },
  rollback: {
    dataRestoreRequired: false,
    functionRemovalDefault: false,
    neverRestoreRuntimeSelfDdlAsFallback: true,
  },
  authorizationBoundaries: {
    ownerDecisionRequiresSeparateAcceptance: true,
    applicationDeployRequiresSeparateAuthorization: true,
    arkRequiresSeparateAuthorization: true,
  },
};

class FakeClient {
  constructor({ failOn = null, helpersPresent = false, semanticFailure = null, waitingLocks = 0 } = {}) {
    this.failOn = failOn;
    this.helpersPresent = helpersPresent;
    this.semanticFailure = semanticFailure;
    this.waitingLocks = waitingLocks;
    this.queries = [];
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (this.failOn && sql.includes(this.failOn)) throw new Error('fixture query failure');
    if (sql === 'BEGIN READ ONLY' || sql.startsWith('SET LOCAL') || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('aios_qianchuan_parse_helper:routines')) {
      return { rows: params[0].map((signature) => {
        const definition = signature.includes('parse_numeric')
          ? `fixture\nregexp_replace(COALESCE(value, ''), '[,%￥¥元\\s]', '', 'g')\nRETURN normalized::NUMERIC;\nEXCEPTION WHEN others THEN`
          : signature.includes('parse_bigint')
            ? 'fixture\nparsed := public.marketing_content_parse_numeric(value);\nRETURN parsed::BIGINT;'
            : `fixture\nregexp_replace(COALESCE(value, ''), '[,%\\s]', '', 'g')\nIF position('%' in COALESCE(value, '')) > 0 OR parsed > 1 THEN\nRETURN parsed / 100;`;
        return {
          signature,
          oid: this.helpersPresent ? '100' : null,
          routine_kind: this.helpersPresent ? 'f' : null,
          language_name: this.helpersPresent ? 'plpgsql' : null,
          volatility_code: this.helpersPresent ? 'i' : null,
          result_type: this.helpersPresent
            ? (signature.includes('bigint') ? 'bigint' : 'numeric')
            : null,
          definition: this.helpersPresent ? definition : null,
        };
      }) };
    }
    if (sql.includes('aios_qianchuan_parse_helper:data_shape')) {
      return { rows: [{ raw_rows: '0', dwd_rows: '0', qianchuan_dwd_rows: '0' }] };
    }
    if (sql.includes('aios_qianchuan_parse_helper:locks')) {
      return { rows: params[0].map((qualifiedName) => ({
        qualified_name: qualifiedName,
        oid: '200',
        relation_kind: 'r',
        granted_locks: '1',
        waiting_locks: String(this.waitingLocks),
      })) };
    }
    if (sql.includes('aios_qianchuan_parse_helper:semantics')) {
      const row = {
        numeric_currency: true,
        numeric_whitespace: true,
        numeric_missing: true,
        numeric_invalid: true,
        bigint_comma: true,
        bigint_invalid: true,
        rate_percent: true,
        rate_whole_percent: true,
        rate_decimal_ratio: true,
        rate_invalid: true,
      };
      if (this.semanticFailure) row[this.semanticFailure] = false;
      return { rows: [row] };
    }
    throw new Error(`Unexpected fixture SQL: ${sql.slice(0, 120)}`);
  }
}

function assertReadOnlyQueries(client) {
  const forbidden = /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|PERFORM|COMMIT|pg_advisory_lock|baseline|apply|Ark)\b/i;
  for (const { sql } of client.queries) {
    const allowed = sql === 'BEGIN READ ONLY'
      || sql === 'ROLLBACK'
      || /^SET LOCAL statement_timeout = '\d+ms'$/.test(sql)
      || /^\/\*[\s\S]*?\*\/\s*SELECT\b/i.test(sql);
    assert.equal(allowed, true, `unexpected SQL outside the read-only allowlist: ${sql}`);
    if (sql !== 'BEGIN READ ONLY' && sql !== 'ROLLBACK') {
      assert.equal(forbidden.test(sql), false, `write-like SQL token found: ${sql}`);
    }
  }
}

const preinstallClient = new FakeClient();
const preinstall = await runQianchuanParseHelperReadonlyProbe({
  client: preinstallClient,
  forwardMigrationSql,
  now: () => new Date('2026-07-25T15:00:00.000Z'),
  plan,
  planArtifact,
  planSha256: planArtifact.sha256,
});
assert.equal(validateQianchuanParseHelperPreinstallReadonlyProbe(preinstall), preinstall);
assert.equal(preinstall.summary.helpersPresent, 0);
assert.equal(preinstall.summary.postinstallReady, false);
assert.equal(preinstallClient.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(preinstallClient);

const postinstallClient = new FakeClient({ helpersPresent: true });
const postinstall = await runQianchuanParseHelperReadonlyProbe({
  client: postinstallClient,
  forwardMigrationSql,
  plan,
  planArtifact,
  planSha256: planArtifact.sha256,
  state: 'postinstall',
});
assert.equal(validateQianchuanParseHelperPostinstallReadonlyProbe(postinstall), postinstall);
assert.equal(postinstall.summary.helpersPresent, 3);
assert.equal(postinstall.summary.exactCatalogHelpers, 3);
assert.equal(postinstall.summary.semanticChecksPassed, 10);
assert.equal(postinstall.summary.postinstallReady, true);
assert.equal(postinstall.policy.migrationLedgerVerified, false);
assert.equal(postinstall.policy.runtimeTransitionAuthorized, false);
assertReadOnlyQueries(postinstallClient);

const textOutput = formatQianchuanParseHelperReadonlyProbe(postinstall, {
  path: '/tmp/parse-helper-postinstall.json',
  bytes: 2000,
  sha256: 'd'.repeat(64),
});
assert.match(textOutput, /semantic_checks=10\/10 postinstall_ready=true/);
assert.doesNotMatch(textOutput, /1,234|12\.5|regexp_replace|CREATE OR REPLACE/);

const badSemanticsClient = new FakeClient({ helpersPresent: true, semanticFailure: 'rate_percent' });
const badSemantics = await runQianchuanParseHelperReadonlyProbe({
  client: badSemanticsClient,
  forwardMigrationSql,
  plan,
  planArtifact,
  planSha256: planArtifact.sha256,
  state: 'postinstall',
});
assert.throws(
  () => validateQianchuanParseHelperPostinstallReadonlyProbe(badSemantics),
  /postinstall evidence is incomplete/,
);

const waitingLockClient = new FakeClient({ waitingLocks: 1 });
const waitingLockResult = await runQianchuanParseHelperReadonlyProbe({
  client: waitingLockClient,
  forwardMigrationSql,
  plan,
  planArtifact,
  planSha256: planArtifact.sha256,
});
assert.throws(
  () => validateQianchuanParseHelperPreinstallReadonlyProbe(waitingLockResult),
  /data-shape or lock evidence is incomplete/,
);

const failingClient = new FakeClient({ failOn: 'data_shape' });
await assert.rejects(
  runQianchuanParseHelperReadonlyProbe({
    client: failingClient,
    forwardMigrationSql,
    plan,
    planArtifact,
    planSha256: planArtifact.sha256,
  }),
  /fixture query failure/,
);
assert.equal(failingClient.queries.at(-1).sql, 'ROLLBACK');
assertReadOnlyQueries(failingClient);

await assert.rejects(
  runQianchuanParseHelperReadonlyProbe({
    client: new FakeClient(),
    forwardMigrationSql,
    plan,
    planArtifact,
    planSha256: '0'.repeat(64),
  }),
  /Parse-helper forward-contract plan SHA-256 differs/,
);

assert.deepEqual(
  parseQianchuanParseHelperReadonlyProbeArgs([
    '--plan', '/tmp/plan.json',
    `--plan-sha256=${'a'.repeat(64)}`,
    '--output', '/tmp/probe.json',
    '--postinstall',
  ]),
  {
    help: false,
    outputPath: '/tmp/probe.json',
    planPath: '/tmp/plan.json',
    planSha256: 'a'.repeat(64),
    state: 'postinstall',
  },
);
for (const option of ['--apply', '--baseline', '--deploy', '--json', '--remove-runtime-ddl', '--write-ledger']) {
  assert.throws(
    () => parseQianchuanParseHelperReadonlyProbeArgs([option]),
    /not supported by the live read-only parse-helper probe/,
  );
}
assert.throws(
  () => parseQianchuanParseHelperReadonlyProbeArgs([
    '--plan', '/tmp/plan.json',
    `--plan-sha256=${'a'.repeat(64)}`,
  ]),
  /--output is required/,
);

const commandSource = readFileSync(new URL(
  './content-assets-qianchuan-production-migration-parse-helper-readonly-probe.mjs',
  import.meta.url,
), 'utf8');
assert.ok(
  commandSource.indexOf('outputReservation = reserveExclusiveMigrationAuditJson(options.outputPath)')
    < commandSource.indexOf('client = new pg.Client'),
  'output must be exclusively reserved before database connection',
);
assert.match(commandSource, /validateQianchuanParseHelperReadonlyProbeSources\(/);
assert.match(commandSource, /writeReservedMigrationAuditJson\(outputReservation, result\)/);
assert.doesNotMatch(commandSource, /writeExclusiveMigrationAuditJson|console\.log\(JSON\.stringify/);

for (const token of [
  "routine.prokind = 'f'",
  "routine.provolatile = 'i'",
  "language.lanname = 'plpgsql'",
  "marketing_content_parse_numeric('1,234.50元')",
  "marketing_content_parse_bigint('1,234')",
  "marketing_content_parse_rate('12.5%')",
]) {
  assert.match(sqlRegressionCheck, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(sqlRegressionCheck, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|CALL|COMMIT)\b/i);

console.log('[qianchuan-parse-helper-readonly-probe-behavior] OK: staged migration pin, pre/postinstall catalog semantics, dormant counts, zero waits, rollback, artifact reservation, redacted stdout, and write denial passed.');
