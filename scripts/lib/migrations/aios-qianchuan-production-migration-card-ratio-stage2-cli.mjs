const VALUE_OPTIONS = new Map([
  ['--batch-size', 'batchSize'],
  ['--checkpoint', 'checkpointPath'],
  ['--checkpoint-sha256', 'checkpointSha256'],
  ['--output', 'outputPath'],
  ['--plan', 'planPath'],
  ['--plan-sha256', 'planSha256'],
  ['--stage1', 'stage1Path'],
  ['--stage1-sha256', 'stage1Sha256'],
]);

export function parseQianchuanCardRatioStage2Args(args) {
  const options = {
    batchSize: 500,
    checkpointPath: null,
    checkpointSha256: null,
    confirmed: false,
    help: false,
    outputPath: null,
    planPath: null,
    planSha256: null,
    stage1Path: null,
    stage1Sha256: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--confirm-stage2-batch') options.confirmed = true;
    else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown qianchuan card-ratio Stage 2 option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (options.help) return options;
  for (const [option, field] of VALUE_OPTIONS) {
    if (field === 'checkpointPath' || field === 'checkpointSha256' || field === 'batchSize') continue;
    if (!options[field]) throw new Error(`${option} is required for Stage 2 execution.`);
  }
  const batchSize = Number(options.batchSize);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error('--batch-size must be an integer from 1 to 500.');
  }
  options.batchSize = batchSize;
  if (Boolean(options.checkpointPath) !== Boolean(options.checkpointSha256)) {
    throw new Error('--checkpoint and --checkpoint-sha256 must be provided together.');
  }
  return options;
}

export function formatQianchuanCardRatioStage2Result(result, artifact = null) {
  const lines = [
    '[qianchuan-card-ratio-stage2-batch]',
    `status=${result.status} mode=${result.mode} batch=${result.batchNumber}`,
    `table=${result.table} updated_rows=${result.updatedRows} batch_size=${result.batchSize}`,
    `external_repaired_rows=${result.externallyRepairedRows ?? 0} cumulative_external_repaired_rows=${result.cumulativeExternallyRepairedRows ?? 0} cumulative_updated_rows=${result.cumulativeUpdatedRows}`,
    `source_growth_rows=${result.sourceGrowthRows ?? 0} cumulative_source_growth_rows=${result.cumulativeSourceGrowthRows ?? 0} ods_mismatch_delta=${result.odsMismatchDelta ?? 0}`,
    `remaining_table=${result.remainingTableMismatchRows} remaining_total=${result.remainingTotalMismatchRows}`,
    `next_table=${result.nextTable ?? 'none'} next_cursor=${result.nextCursor?.join('|') ?? 'none'}`,
    `backup_run_id=${result.backupRunId} ledger_written=${result.policy.ledgerWritten}`,
    `deploy_authorized=${result.policy.deployAuthorized} ark_invoked=${result.policy.arkInvoked}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
