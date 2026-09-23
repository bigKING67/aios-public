const VALUE_OPTIONS = new Map([
  ['--manifest', 'manifestPath'],
  ['--manifest-sha256', 'manifestSha256'],
  ['--output', 'outputPath'],
]);

export function parseAiosMigrationLedgerBootstrapArgs(args) {
  const options = {
    confirmed: false,
    help: false,
    manifestPath: null,
    manifestSha256: null,
    outputPath: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--confirm-ledger-bootstrap') options.confirmed = true;
    else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown migration ledger bootstrap option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (!options[field]) throw new Error(`${option} is required for migration ledger bootstrap.`);
    }
  }
  return options;
}

export function assertAiosMigrationLedgerBootstrapAuthorization({ confirmed, env }) {
  if (confirmed !== true
    || env.AIOS_MIGRATION_LEDGER_BOOTSTRAP_WRITE_ACK !== 'bootstrap-v2') {
    throw new Error(
      'Migration ledger bootstrap requires --confirm-ledger-bootstrap and '
      + 'AIOS_MIGRATION_LEDGER_BOOTSTRAP_WRITE_ACK=bootstrap-v2.',
    );
  }
  const expectedGitSha = env.AIOS_MIGRATION_EXPECTED_GIT_SHA?.trim() ?? '';
  if (!/^[a-f0-9]{40}$/u.test(expectedGitSha)) {
    throw new Error('AIOS_MIGRATION_EXPECTED_GIT_SHA must be an explicit 40-character SHA.');
  }
  return { expectedGitSha };
}

export function formatAiosMigrationLedgerBootstrapResult(result, artifact = null) {
  const lines = [
    '[aios-migration-ledger-bootstrap]',
    `status=${result.status} committed=${result.policy.committed}`,
    `schema_before=${result.schema.before} schema_mutation=${result.schema.mutation} schema_after=${result.schema.after}`,
    `rows_before=${result.rows.before} rows_requested=${result.rows.requested} rows_inserted=${result.rows.inserted} rows_after=${result.rows.after}`,
    `queries=${result.queryStats.total} chunks=${result.queryStats.bulkInsertChunks} upper_bound=${result.queryStats.upperBound} no_n_plus_one=${result.queryStats.noNPlusOne}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
