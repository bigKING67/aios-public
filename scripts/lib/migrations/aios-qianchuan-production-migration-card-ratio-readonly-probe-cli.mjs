const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--p1', 'p1Path'],
  ['--p1-sha256', 'p1Sha256'],
  ['--p1d-probe', 'p1dProbePath'],
  ['--p1d-probe-sha256', 'p1dProbeSha256'],
]);

export function parseQianchuanCardRatioReadonlyProbeArgs(args) {
  const options = {
    help: false,
    json: false,
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
    else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown qianchuan card-ratio read-only probe option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (option !== '--output' && !options[field]) {
        throw new Error(`${option} is required for the live read-only card-ratio probe.`);
      }
    }
  }
  return options;
}

export function formatQianchuanCardRatioReadonlyProbe(result, artifact = null) {
  const lines = [
    '[qianchuan-card-ratio-readonly-probe]',
    `mode=${result.mode} relations=${result.summary.relationsPresent} primary_keys=${result.summary.exactPrimaryKeys} refresh_routines=${result.summary.refreshRoutinesPresent}`,
    `ads_mismatch_rows=${result.summary.adsMismatchRows} ods_mismatch_rows=${result.summary.odsMismatchRows} recompute_functions=${result.summary.recomputeFunctionsPresent} ratio_triggers=${result.summary.ratioTriggersPresent} waiting_locks=${result.summary.waitingLocks}`,
    `p1=${result.sourceArtifacts.p1.path} sha256=${result.sourceArtifacts.p1.sha256}`,
    `p1d_probe=${result.sourceArtifacts.p1dProbe.path} sha256=${result.sourceArtifacts.p1dProbe.sha256}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
