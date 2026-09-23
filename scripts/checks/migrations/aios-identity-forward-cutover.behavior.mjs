#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  applyIdentityCutover, assertIdentityAfter, assertIdentityBefore, identityFailureReceipt, IDENTITY_ACK,
  IDENTITY_TARGETS, prepareIdentityCutover, verifyIdentityCutover,
} from '../../lib/migrations/aios-identity-forward-cutover.mjs';

const sha = 'a'.repeat(40);
const files = Object.fromEntries(IDENTITY_TARGETS.map(([name]) => [name, readFileSync(`sql/migrations/${name}`, 'utf8')]));
const git = { branch: 'main', head: sha, originMain: sha, status: '' };
const env = { AIOS_MIGRATION_EXPECTED_GIT_SHA: sha, AIOS_IDENTITY_EXPECTED_DATABASE: 'fixture',
  AIOS_IDENTITY_ALLOW_LIVE_READONLY: '1', AIOS_IDENTITY_WRITE_ACK: IDENTITY_ACK };
const input = { command: 'verify', env, git, files };
const prepared = prepareIdentityCutover(input);
const auth = ['users', 'roles', 'permissions', 'user_roles', 'role_permissions', 'refresh_tokens', 'audit_logs']
  .map((name, index) => ({ name: `ods_datahub_${name}`, oid: String(index + 1), count: '3' }));
const before = { databaseName: 'fixture', serverAddress: '127.0.0.1', serverPort: '5432',
  ledgerExists: false, assetsExist: true, auth, content: [] };
const after = { ...before, auth: auth.map((table) => ({ ...table, name: table.name.replace('datahub', 'aios') })),
  content: ['projects', 'revisions', 'jobs', 'shot_catalogs', 'shot_jobs', 'semantic_jobs']
    .map((name) => ({ name: `content_production_${name}` })) };
assertIdentityBefore(before);
assertIdentityAfter(before, after);
for (const changed of [{ ledgerExists: true }, { assetsExist: false }, { auth: auth.slice(1) }, { content: after.content }]) {
  assert.throws(() => assertIdentityBefore({ ...before, ...changed }));
}
assert.throws(() => assertIdentityAfter(before, { ...after, auth: after.auth.map((t) => ({ ...t, count: '4' })) }));
assert.throws(() => prepareIdentityCutover({ ...input, git: { ...git, status: ' M file' } }));
assert.throws(() => prepareIdentityCutover({ ...input, git: { ...git, originMain: 'b'.repeat(40) } }));
assert.throws(() => prepareIdentityCutover({ ...input, files: { ...files, [IDENTITY_TARGETS[0][0]]: 'changed' } }));
assert.throws(() => prepareIdentityCutover({ ...input, command: 'apply', confirmed: false }));

function mockClient({ post = after, failMigration = false, initial = before } = {}) {
  let topology = initial;
  const queries = [];
  return { queries, async query(sql, params) {
    queries.push(sql);
    if (sql.startsWith('SELECT current_database()')) return { rows: [topology] };
    if (sql.includes("relnamespace='public'")) return { rows: topology.auth.map(({ name, oid }) => ({ name, oid })) };
    if (sql.startsWith('SELECT count(*)')) {
      const table = topology.auth.find((item) => sql.includes(`"${item.name}"`));
      return { rows: [{ count: table.count }] };
    }
    if (sql.includes("relnamespace='ads'")) return { rows: topology.content };
    if (sql === prepared.migration.sql) {
      if (failMigration) throw new Error('fixture migration failure');
      topology = post;
    }
    assert.ok(params === undefined || Array.isArray(params));
    return { rows: [] };
  } };
}
const reader = mockClient();
const verify = await verifyIdentityCutover({ client: reader, prepared });
assert.equal(verify.status, 'ready');
assert.equal(reader.queries[0], 'BEGIN TRANSACTION READ ONLY');
assert.equal(reader.queries.at(-1), 'ROLLBACK');
assert.ok(!reader.queries.includes(prepared.migration.sql));
const writeInput = { ...input, command: 'apply', confirmed: true, verify };
for (const patch of [{ status: 'not_ready' }, { gitSha: 'b'.repeat(40) }, { databaseName: 'other' },
  { generatedAt: '2000-01-01T00:00:00Z' }, { targetSha256: '0'.repeat(64) }]) {
  assert.throws(() => prepareIdentityCutover({ ...writeInput, verify: { ...verify, ...patch } }));
}
const writerPrepared = prepareIdentityCutover(writeInput);
const good = mockClient();
const result = await applyIdentityCutover({ client: good, prepared: writerPrepared });
assert.equal(result.status, 'applied');
assert.equal(good.queries.at(-1), 'COMMIT');
assert.equal(result.policy.historicalLedgerRowsWritten, false);
for (const options of [{ failMigration: true }, { post: { ...after, auth: [] } },
  { initial: { ...before, serverAddress: '127.0.0.2' } },
  { initial: { ...before, auth: auth.map((t) => ({ ...t, count: '4' })) } }]) {
  const bad = mockClient(options);
  await assert.rejects(applyIdentityCutover({ client: bad, prepared: writerPrepared }));
  assert.equal(bad.queries.at(-1), 'ROLLBACK');
  assert.ok(!bad.queries.includes('COMMIT'));
}
console.log('PASS: identity cutover pins, ACK, freshness, topology, readonly, transaction and rollback contracts');

for (const args of [[], ['verify', '--unknown-option']]) {
  const failed = spawnSync(process.execPath, ['scripts/migrations/aios-identity-forward-cutover.mjs', ...args], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://invalid@127.0.0.1:1/unreachable' } });
  assert.equal(failed.status, 1);
  assert.doesNotMatch(failed.stderr, /ECONNREFUSED/);
  assert.match(failed.stderr, /Specify verify or apply|Unknown option/);
}

const auditFailure = identityFailureReceipt(new Error('disk full'), result, 'disk full');
assert.equal(auditFailure.committed, true);
assert.equal(auditFailure.stage, 'audit_write');
const earlyFailure = identityFailureReceipt(new Error('bad pin'), undefined, 'bad pin');
assert.equal(earlyFailure.committed, false);
assert.equal(earlyFailure.stage, 'preflight');
const rollbackFailure = identityFailureReceipt({ cutoverCommitted: false, cutoverStage: 'inspect_after' }, undefined, 'postcheck');
assert.equal(rollbackFailure.committed, false);
assert.equal(rollbackFailure.stage, 'inspect_after');
