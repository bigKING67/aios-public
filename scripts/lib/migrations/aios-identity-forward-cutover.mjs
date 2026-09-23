import {
  applyLedgerFreeForwardCutover,
  assertLedgerFreeGitState,
  ledgerFreeDatabaseIdentitySha256,
  ledgerFreeSha256,
} from './aios-ledger-free-forward-cutover-engine.mjs';

export const IDENTITY_TARGETS = Object.freeze([
  ['021_content_production.sql', '1bd6eea3ef3f7d53c0f43e61c9857a6f2c03587606702635c54cd95fddf075ed'],
  ['022_content_production_shot_catalogs.sql', '7b56a877a349df8158d78a7a53fb9df6f79e5f558b7ed7bfe1afd492147a3b5e'],
  ['023_content_production_shot_jobs.sql', 'dc2e6754b6c70f0613e93d48c584ba99d9df0e7cd25342e9d481812286974d95'],
  ['024_content_production_semantic_jobs.sql', '634872ef5ebb22d30ece4e3a139943842ed5738abe64adbeabf3e154c952413a'],
  ['025_aios_identity.sql', 'fb04a71acdd74bc8aa735cc39ac90c9fb0b1cec4f1c9a74259ea4910b5c17cf4'],
]);
const AUTH = ['users', 'roles', 'permissions', 'user_roles', 'role_permissions', 'refresh_tokens', 'audit_logs'];
const CONTENT = ['projects', 'revisions', 'jobs', 'shot_catalogs', 'shot_jobs', 'semantic_jobs'];
const LABEL = 'AIOS identity and content-production cutover';
export const IDENTITY_ACK = 'apply-backend-021-through-025-v1';

export function prepareIdentityCutover({ command, confirmed, env, git, files, verify }) {
  if (!['verify', 'apply'].includes(command)) throw new Error('Expected verify or apply.');
  const expectedGitSha = env.AIOS_MIGRATION_EXPECTED_GIT_SHA;
  if (!/^[a-f0-9]{40}$/u.test(expectedGitSha ?? '')) throw new Error('Expected Git SHA is required.');
  assertLedgerFreeGitState({ expectedGitSha, git, label: LABEL });
  const expectedDatabase = env.AIOS_IDENTITY_EXPECTED_DATABASE;
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/u.test(expectedDatabase ?? '')) {
    throw new Error('Expected database name is required.');
  }
  const bodies = IDENTITY_TARGETS.map(([name, checksum]) => {
    const body = files[name];
    if (typeof body !== 'string' || ledgerFreeSha256(body) !== checksum) {
      throw new Error(`Pinned migration differs: ${name}`);
    }
    return body;
  });
  if (command === 'apply') {
    if (!confirmed || env.AIOS_IDENTITY_WRITE_ACK !== IDENTITY_ACK) {
      throw new Error('Explicit identity cutover ACK and CLI confirmation are required.');
    }
    if (verify?.kind !== 'aios_identity_preflight_v1' || verify.status !== 'ready'
      || verify.gitSha !== expectedGitSha || verify.databaseName !== expectedDatabase
      || verify.targetSha256 !== ledgerFreeSha256(bodies.join('\n'))
      || !/^[a-f0-9]{64}$/u.test(verify.databaseIdentitySha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(verify.runtimeSha256 ?? '')) {
      throw new Error('A matching ready preflight artifact is required.');
    }
    const age = Date.now() - Date.parse(verify.generatedAt);
    if (!Number.isFinite(age) || age < 0 || age > 3600000) throw new Error('Preflight is stale.');
  } else if (env.AIOS_IDENTITY_ALLOW_LIVE_READONLY !== '1') {
    throw new Error('Read-only preflight acknowledgement is required.');
  }
  return {
    command, expectedGitSha, expectedDatabase, verify,
    migrationAdvisoryLockKey: 'aios-schema-migrations-v1',
    migration: { sql: bodies.join('\n') },
  };
}

export async function readIdentityTopology(client) {
  const { rows: [identity] } = await client.query(`SELECT current_database() AS "databaseName",
    COALESCE(inet_server_addr()::text,'local') AS "serverAddress",
    COALESCE(inet_server_port()::text,'local') AS "serverPort",
    to_regclass('public.aios_schema_migrations') IS NOT NULL OR
      to_regclass('public.datahub_schema_migrations') IS NOT NULL AS "ledgerExists",
    to_regclass('ads.marketing_content_assets') IS NOT NULL AS "assetsExist"`);
  const names = AUTH.flatMap((name) => [`ods_datahub_${name}`, `ods_aios_${name}`]);
  const { rows: auth } = await client.query(`SELECT relname AS name, oid::text AS oid
    FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[])
    AND relkind='r' ORDER BY relname`, [names]);
  for (const table of auth) {
    // Only the closed constant allowlist above can supply a SQL identifier.
    if (!names.includes(table.name)) throw new Error('Unexpected auth table.');
    const { rows: [row] } = await client.query(`SELECT count(*)::text AS count FROM public."${table.name}"`);
    table.count = row.count;
  }
  const { rows: content } = await client.query(`SELECT relname AS name FROM pg_class
    WHERE relnamespace='ads'::regnamespace AND relname=ANY($1::text[]) AND relkind='r'
    ORDER BY relname`, [CONTENT.map((name) => `content_production_${name}`)]);
  return { ...identity, auth, content };
}

export function assertIdentityBefore(topology) {
  if (topology.ledgerExists || !topology.assetsExist || topology.content.length !== 0
    || topology.auth.length !== AUTH.length
    || AUTH.some((name) => !topology.auth.some((table) => table.name === `ods_datahub_${name}`))) {
    throw new Error('Pre-cutover topology is absent, partial, collided, or ledger-managed.');
  }
}

export function assertIdentityAfter(before, after) {
  if (after.ledgerExists || !after.assetsExist || after.content.length !== CONTENT.length
    || CONTENT.some((name) => !after.content.some((table) => table.name === `content_production_${name}`))
    || after.auth.length !== AUTH.length) throw new Error('Post-cutover topology differs.');
  for (const old of before.auth) {
    const table = after.auth.find((item) => item.name === old.name.replace('ods_datahub_', 'ods_aios_'));
    if (!table || table.oid !== old.oid || table.count !== old.count) {
      throw new Error('Auth/audit identity or row-count preservation failed.');
    }
  }
}

function assertDatabase(topology, prepared) {
  if (topology.databaseName !== prepared.expectedDatabase) throw new Error('Database name differs.');
  if (prepared.verify && ledgerFreeDatabaseIdentitySha256(topology, LABEL)
    !== prepared.verify.databaseIdentitySha256) throw new Error('Database identity differs.');
}

export async function verifyIdentityCutover({ client, prepared }) {
  await client.query('BEGIN TRANSACTION READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout='30s'");
    const topology = await readIdentityTopology(client);
    assertDatabase(topology, prepared);
    assertIdentityBefore(topology);
    return {
      kind: 'aios_identity_preflight_v1', status: 'ready', generatedAt: new Date().toISOString(),
      gitSha: prepared.expectedGitSha, databaseName: topology.databaseName,
      databaseIdentitySha256: ledgerFreeDatabaseIdentitySha256(topology, LABEL),
      runtimeSha256: ledgerFreeSha256(JSON.stringify(topology)),
      targetSha256: ledgerFreeSha256(prepared.migration.sql),
    };
  } finally {
    await client.query('ROLLBACK');
  }
}

export async function applyIdentityCutover({ client, prepared }) {
  let before;
  return applyLedgerFreeForwardCutover({
    client, prepared, label: LABEL, mode: 'aios_identity_cutover_v1',
    lockComment: 'aios_identity_cutover', targetAdvisoryLock: 'aios:identity:021-025:v1',
    readTopology: readIdentityTopology, assertDatabaseIdentity: assertDatabase,
    assertBefore(topology) {
      assertIdentityBefore(topology);
      if (ledgerFreeSha256(JSON.stringify(topology)) !== prepared.verify.runtimeSha256) {
        throw new Error('Runtime changed after preflight; stop writers and verify again.');
      }
      before = topology;
    },
    preMigrationChecks: [{ stage: 'legacy_migration_lock',
      sql: "SELECT pg_advisory_xact_lock(hashtext('datahub-schema-migrations-v1'))" }],
    shouldExecuteMigration: () => true, healthChecks: [],
    assertPostconditions: (after) => assertIdentityAfter(before, after),
    baseResult: ({ generatedAt, status }) => ({ generatedAt, status,
      kind: 'aios_identity_cutover_v1', gitSha: prepared.expectedGitSha,
      targetSha256: ledgerFreeSha256(prepared.migration.sql) }),
    policy: ({ committed }) => ({ committed, historicalLedgerRowsWritten: false }),
  });
}

export function identityFailureReceipt(error, result, message) {
  return { status: 'failed', message,
    committed: result?.policy?.committed === true || error?.cutoverCommitted === true,
    stage: error?.cutoverStage ?? (result ? 'audit_write' : 'preflight') };
}
