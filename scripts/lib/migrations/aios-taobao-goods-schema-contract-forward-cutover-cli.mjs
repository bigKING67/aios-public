const COMMANDS = new Set(['apply', 'verify']);
const VALUE_OPTIONS = new Map([
  ['--expected-migration-sha256', 'expectedMigrationSha256'],
  ['--expected-prerequisite-migration-sha256', 'expectedPrerequisiteMigrationSha256'],
  ['--output', 'outputPath'],
]);


export function parseTaobaoGoodsSchemaContractForwardCutoverArgs(args) {
  const [command, ...options] = args;
  if (command === '--help' || command === '-h') {
    return {
      command: null,
      confirmed: false,
      expectedMigrationSha256: null,
      expectedPrerequisiteMigrationSha256: null,
      help: true,
      outputPath: null,
    };
  }
  if (!COMMANDS.has(command)) {
    throw new Error(
      `Unsupported Taobao goods schema contract forward cutover command: ${command ?? 'missing'}.`,
    );
  }

  const parsed = {
    command,
    confirmed: false,
    expectedMigrationSha256: null,
    expectedPrerequisiteMigrationSha256: null,
    help: false,
    outputPath: null,
  };
  for (let index = 0; index < options.length; index += 1) {
    const argument = options[index];
    if (argument === '--confirm-forward-cutover') {
      if (command !== 'apply') throw new Error('--confirm-forward-cutover is valid only for apply.');
      parsed.confirmed = true;
      continue;
    }
    if (VALUE_OPTIONS.has(argument)) {
      const value = options[index + 1] ?? null;
      index += 1;
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      parsed[VALUE_OPTIONS.get(argument)] = value;
      continue;
    }
    const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
    if (!matched) {
      throw new Error(`Unknown Taobao goods schema contract forward cutover option: ${argument}.`);
    }
    const value = argument.slice(matched[0].length + 1);
    if (!value) throw new Error(`${matched[0]} requires a value.`);
    parsed[matched[1]] = value;
  }
  if (!parsed.outputPath) {
    throw new Error('--output is required for Taobao goods schema contract forward cutover.');
  }
  if (!/^[a-f0-9]{64}$/u.test(parsed.expectedMigrationSha256 ?? '')) {
    throw new Error('--expected-migration-sha256 must be an explicit 64-character SHA-256.');
  }
  if (!/^[a-f0-9]{64}$/u.test(parsed.expectedPrerequisiteMigrationSha256 ?? '')) {
    throw new Error(
      '--expected-prerequisite-migration-sha256 must be an explicit 64-character SHA-256.',
    );
  }
  return parsed;
}


export function resolveTaobaoGoodsSchemaContractForwardCutoverAuthorization({
  command,
  confirmed,
  env,
}) {
  const expectedGitSha = env.AIOS_MIGRATION_EXPECTED_GIT_SHA?.trim() ?? '';
  const expectedDatabase = env.AIOS_TAOBAO_GOODS_EXPECTED_DATABASE?.trim() ?? '';
  const expectedDatabaseIdentitySha256 =
    env.AIOS_TAOBAO_GOODS_EXPECTED_DATABASE_IDENTITY_SHA256?.trim() || null;
  const expectedRuntimeContractSha256 =
    env.AIOS_TAOBAO_GOODS_SCHEMA_CONTRACT_EXPECTED_RUNTIME_SHA256?.trim() || null;

  if (!/^[a-f0-9]{40}$/u.test(expectedGitSha)) {
    throw new Error('AIOS_MIGRATION_EXPECTED_GIT_SHA must be an explicit 40-character SHA.');
  }
  if (!expectedDatabase) throw new Error('AIOS_TAOBAO_GOODS_EXPECTED_DATABASE is required.');
  if (command === 'verify') {
    if (env.AIOS_TAOBAO_GOODS_SCHEMA_CONTRACT_ALLOW_LIVE_READONLY !== '1') {
      throw new Error(
        'Verify requires AIOS_TAOBAO_GOODS_SCHEMA_CONTRACT_ALLOW_LIVE_READONLY=1.',
      );
    }
  } else if (confirmed !== true
    || env.AIOS_TAOBAO_GOODS_SCHEMA_CONTRACT_WRITE_ACK
      !== 'apply-warehouse-20260806-1900-v1') {
    throw new Error(
      'Apply requires --confirm-forward-cutover and '
      + 'AIOS_TAOBAO_GOODS_SCHEMA_CONTRACT_WRITE_ACK='
      + 'apply-warehouse-20260806-1900-v1.',
    );
  }

  for (const [value, label] of [
    [expectedDatabaseIdentitySha256, 'AIOS_TAOBAO_GOODS_EXPECTED_DATABASE_IDENTITY_SHA256'],
    [
      expectedRuntimeContractSha256,
      'AIOS_TAOBAO_GOODS_SCHEMA_CONTRACT_EXPECTED_RUNTIME_SHA256',
    ],
  ]) {
    if (value !== null && !/^[a-f0-9]{64}$/u.test(value)) {
      throw new Error(`${label} must be 64 lowercase hex characters.`);
    }
    if (command === 'apply' && value === null) {
      throw new Error(`Apply requires ${label} from the final verify artifact.`);
    }
  }
  return {
    expectedDatabase,
    expectedDatabaseIdentitySha256,
    expectedGitSha,
    expectedRuntimeContractSha256,
  };
}


export function formatTaobaoGoodsSchemaContractForwardCutoverResult(result, artifact) {
  const topology = result.topology?.after ?? result.topology;
  return [
    '[taobao-goods-schema-contract-forward-cutover]',
    `mode=${result.mode} status=${result.status}`,
    `database=${result.database.name} target=${result.migration.identity} checksum=${result.migration.checksum}`,
    `prerequisite=${result.prerequisiteMigration.identity} checksum=${result.prerequisiteMigration.checksum}`,
    `contract=${topology.contractState} runtime_sha256=${topology.runtimeContractSha256} ledger=${topology.ledgerExists ? 'present' : 'missing'}`,
    `committed=${result.policy.committed === true} prerequisite_body=${result.policy.prerequisiteMigrationBodyExecuted === true} migration_body=${result.policy.migrationBodyExecuted === true} ledger_writes=${result.policy.ledgerWrites === true}`,
    `artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`,
  ].join('\n');
}
