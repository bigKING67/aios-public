const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--p1', 'p1Path'],
  ['--p1-sha256', 'p1Sha256'],
  ['--p1d-probe', 'p1dProbePath'],
  ['--p1d-probe-sha256', 'p1dProbeSha256'],
]);

export function parseQianchuanInfluencerTagReadonlyProbeArgs(args) {
  const options = {
    help: false,
    json: false,
    postrepair: false,
    outputPath: null,
    p1Path: null,
    p1Sha256: null,
    p1dProbePath: null,
    p1dProbeSha256: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--postrepair') options.postrepair = true;
    else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown qianchuan influencer-tag read-only probe option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (option !== '--output' && !options[field]) {
        throw new Error(`${option} is required for the live read-only influencer-tag probe.`);
      }
    }
  }
  return options;
}

export function formatQianchuanInfluencerTagReadonlyProbe(result, artifact = null) {
  const lines = [
    '[qianchuan-influencer-tag-readonly-probe]',
    `mode=${result.mode} table=${result.summary.relationsPresent} primary_key=${result.summary.exactPrimaryKeys} columns=${result.summary.exactRequiredColumns} support_routines=${result.summary.supportRoutinesPresent}`,
    `active_rows=${result.summary.activeRows} normalized_rows=${result.summary.rowsWithNormalizedTags} mismatch_rows=${result.summary.mismatchRows} captured=${result.summary.impactRowsCaptured} backup_bytes=${result.summary.estimatedBackupBytes} waiting_locks=${result.summary.waitingLocks}`,
    `normalize_function_present=${result.summary.normalizeFunctionPresent} touch_trigger=${result.summary.touchTriggerPresent} repair_plan_ready=${result.summary.repairPlanReady}`,
    `p1=${result.sourceArtifacts.p1.path} sha256=${result.sourceArtifacts.p1.sha256}`,
    `p1d_probe=${result.sourceArtifacts.p1dProbe.path} sha256=${result.sourceArtifacts.p1dProbe.sha256}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
