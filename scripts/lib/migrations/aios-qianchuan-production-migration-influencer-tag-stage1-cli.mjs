const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--plan', 'planPath'],
  ['--plan-sha256', 'planSha256'],
  ['--repair-run-id', 'repairRunId'],
]);

export function parseQianchuanInfluencerTagStage1Args(args) {
  const options = {
    confirmed: false,
    help: false,
    outputPath: null,
    planPath: null,
    planSha256: null,
    repairRunId: null,
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
      if (!matched) throw new Error(`Unknown qianchuan influencer-tag Stage 1 option: ${argument}.`);
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

export function formatQianchuanInfluencerTagStage1Result(result, artifact = null) {
  const lines = [
    '[qianchuan-influencer-tag-stage1]',
    `status=${result.status} mode=${result.mode} transaction=${result.policy.transaction}`,
    `repair_run_id=${result.backup.runId} backup_rows=${result.backup.rows} backup_table=${result.backup.table}`,
    `function_source_sha256=${result.forwardFunction.sourceSha256} function_catalog_sha256=${result.forwardFunction.catalogDefinitionSha256}`,
    `canary_id=${result.canary.id} remaining_mismatch_rows=${result.postcheck.remainingMismatchRows}`,
    `stage1_committed=${result.policy.canaryCommitted} full_backfill=${result.policy.fullBackfillExecuted} ledger_written=${result.policy.ledgerWritten}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
