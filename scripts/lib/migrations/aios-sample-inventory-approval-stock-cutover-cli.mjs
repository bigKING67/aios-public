const VALUE_OPTIONS = new Map([
  ['--expected-migration-sha256', 'expectedMigrationSha256'],
  ['--output', 'outputPath'],
]);

export function parseSampleInventoryApprovalStockCutoverArgs(args) {
  const [command, ...options] = args;
  if (!command || command === '--help' || command === '-h') return { help: true };
  if (!['verify', 'apply'].includes(command)) {
    throw new Error(`Unsupported sample inventory approval-stock cutover command: ${command}.`);
  }
  const parsed = {
    command,
    confirmed: false,
    expectedMigrationSha256: null,
    help: false,
    outputPath: null,
  };
  for (let index = 0; index < options.length; index += 1) {
    const argument = options[index];
    if (argument === '--confirm-approval-stock-cutover') {
      if (command !== 'apply') {
        throw new Error('--confirm-approval-stock-cutover is valid only for apply.');
      }
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
      throw new Error(`Unknown sample inventory approval-stock cutover option: ${argument}.`);
    }
    const value = argument.slice(matched[0].length + 1);
    if (!value) throw new Error(`${matched[0]} requires a value.`);
    parsed[matched[1]] = value;
  }
  if (!parsed.outputPath) {
    throw new Error('--output is required for sample inventory approval-stock cutover.');
  }
  if (!/^[a-f0-9]{64}$/u.test(parsed.expectedMigrationSha256 ?? '')) {
    throw new Error('--expected-migration-sha256 must be an explicit 64-character SHA-256.');
  }
  return parsed;
}

export function resolveSampleInventoryApprovalStockCutoverAuthorization({ command, confirmed, env }) {
  const expectedGitSha = env.AIOS_MIGRATION_EXPECTED_GIT_SHA?.trim() ?? '';
  const expectedDatabase = env.AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE?.trim() ?? '';
  const expectedDatabaseIdentitySha256 =
    env.AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE_IDENTITY_SHA256?.trim() || null;
  if (!/^[a-f0-9]{40}$/u.test(expectedGitSha)) {
    throw new Error('AIOS_MIGRATION_EXPECTED_GIT_SHA must be an explicit 40-character SHA.');
  }
  if (!expectedDatabase) {
    throw new Error('AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE is required.');
  }
  if (command === 'verify') {
    if (env.AIOS_SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_ALLOW_LIVE_READONLY !== '1') {
      throw new Error(
        'Verify requires AIOS_SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_ALLOW_LIVE_READONLY=1.',
      );
    }
  } else if (confirmed !== true
    || env.AIOS_SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_WRITE_ACK !== 'apply-backend-017-v1') {
    throw new Error(
      'Apply requires --confirm-approval-stock-cutover and '
      + 'AIOS_SAMPLE_INVENTORY_APPROVAL_STOCK_CUTOVER_WRITE_ACK=apply-backend-017-v1.',
    );
  }
  if (expectedDatabaseIdentitySha256 !== null
    && !/^[a-f0-9]{64}$/u.test(expectedDatabaseIdentitySha256)) {
    throw new Error(
      'AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE_IDENTITY_SHA256 must be 64 lowercase hex characters.',
    );
  }
  if (command === 'apply' && expectedDatabaseIdentitySha256 === null) {
    throw new Error(
      'Apply requires AIOS_SAMPLE_INVENTORY_EXPECTED_DATABASE_IDENTITY_SHA256 from the final verify artifact.',
    );
  }
  return { expectedDatabase, expectedDatabaseIdentitySha256, expectedGitSha };
}

export function formatSampleInventoryApprovalStockCutoverResult(result, artifact) {
  const topology = result.topology?.after ?? result.topology;
  return [
    '[sample-inventory-approval-stock-cutover]',
    `mode=${result.mode} status=${result.status}`,
    `database=${result.database.name} target=${result.migration.identity} checksum=${result.migration.checksum}`,
    `active_approved=${topology.activeApprovedRequests} exact_debits=${topology.exactDebitedRequests} pending_debits=${topology.pendingDebitRequests} pending_quantity=${topology.pendingDebitQuantity}`,
    `affected_samples=${topology.affectedSamples} missing_samples=${topology.missingSamples} violating_samples=${topology.violatingSamples} malformed_debits=${topology.malformedDebitRequests}`,
    `ledger=${topology.ledgerExists ? 'present' : 'missing'} committed=${result.policy.committed === true} migration_body=${result.policy.migrationBodyExecuted === true} ledger_writes=${result.policy.ledgerWrites === true}`,
    `artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`,
  ].join('\n');
}
