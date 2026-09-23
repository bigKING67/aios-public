const VALUE_OPTIONS = new Map([
  ['--backup-run-id', 'backupRunId'],
  ['--migration-sha256', 'migrationSha256'],
  ['--output', 'outputPath'],
  ['--plan', 'planPath'],
  ['--plan-sha256', 'planSha256'],
]);

export function parseQianchuanCardRatioStage1Args(args) {
  const options = {
    backupRunId: null,
    confirmed: false,
    help: false,
    migrationSha256: null,
    outputPath: null,
    planPath: null,
    planSha256: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--confirm-stage1') options.confirmed = true;
    else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown qianchuan card-ratio Stage 1 option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (!options[field]) throw new Error(`${option} is required for Stage 1 execution.`);
    }
  }
  return options;
}

export function formatQianchuanCardRatioStage1Result(result, artifact = null) {
  const lines = [
    '[qianchuan-card-ratio-stage1]',
    `status=${result.status} mode=${result.mode} transaction=${result.policy.transaction}`,
    `backup_run_id=${result.backup.runId} backup_rows=${result.backup.rows} backup_table=${result.backup.table}`,
    `guard_functions=${result.guard.functionsPresent} guard_triggers=${result.guard.enabledTriggersPresent} ledger_written=${result.policy.ledgerWritten}`,
    `canary_date=${result.canary.date} canary_rows=${result.canary.plannedMismatchRows} full_backfill=${result.policy.fullBackfillExecuted}`,
    `pre_ads_mismatch=${result.preflight.adsMismatchRows} post_ads_mismatch=${result.postcheck.adsMismatchRows} post_waiting_locks=${result.postcheck.waitingLocks}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
