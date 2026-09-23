const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--probe', 'probePath'],
  ['--probe-sha256', 'probeSha256'],
]);

export function parseQianchuanInfluencerTagRepairPlanArgs(args) {
  const options = {
    help: false,
    json: false,
    outputPath: null,
    probePath: null,
    probeSha256: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown qianchuan influencer-tag repair-plan option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (option !== '--output' && !options[field]) {
        throw new Error(`${option} is required for the offline influencer-tag repair plan.`);
      }
    }
  }
  return options;
}

export function formatQianchuanInfluencerTagRepairPlan(plan, artifact = null) {
  const lines = [
    '[qianchuan-influencer-tag-repair-plan]',
    `mode=${plan.mode} ready=${plan.decision.repairPlanReady} strategy=${plan.decision.recommendedStrategy}`,
    `mismatch_rows=${plan.observed.mismatchRows} canary_rows=${plan.execution.canary.rows} remaining_rows=${plan.execution.batching.remainingRows} max_rows_per_transaction=${plan.execution.batching.maxRowsPerTransaction}`,
    `backup_rows=${plan.execution.backup.estimatedRows} backup_raw_bytes=${plan.execution.backup.rawPayloadBytes} backup_created=${plan.execution.backup.created}`,
    `function=${plan.execution.forwardFunction.signature} definition_sha256=${plan.execution.forwardFunction.definitionSha256}`,
    `probe=${plan.sourceArtifact.path} sha256=${plan.sourceArtifact.sha256}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
