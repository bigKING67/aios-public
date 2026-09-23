const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--p1', 'p1Path'],
  ['--p1-sha256', 'p1Sha256'],
  ['--p1d-probe', 'p1dProbePath'],
  ['--p1d-probe-sha256', 'p1dProbeSha256'],
]);

export function parseQianchuanAlimamaRuntimeReplacementReadonlyProbeArgs(args) {
  const options = {
    help: false,
    outputPath: null,
    p1Path: null,
    p1Sha256: null,
    p1dProbePath: null,
    p1dProbeSha256: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (['--apply', '--deploy', '--execute', '--json', '--repair', '--write-ledger'].includes(argument)) {
      throw new Error(`${argument} is not supported by the live read-only Alimama runtime replacement probe.`);
    } else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown Alimama runtime replacement probe option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (option !== '--output' && !options[field]) {
        throw new Error(`${option} is required for the live read-only Alimama runtime replacement probe.`);
      }
    }
  }
  return options;
}

export function formatQianchuanAlimamaRuntimeReplacementReadonlyProbe(result, artifact = null) {
  const summary = result.summary;
  const reconciliation = result.dataShapes.latestReconciliation ?? {};
  const lines = [
    '[qianchuan-alimama-runtime-replacement-readonly-probe]',
    `mode=${result.mode} ready=${summary.runtimeReplacementReady} waiting_locks=${summary.waitingLocks}`,
    `legacy_relations/routines=${summary.legacyRelationsPresent}/${summary.legacyRoutinesPresent} replacement_relations/routines=${summary.replacementRelationsPresent}/${summary.replacementRoutinesPresent}`,
    `source_rows=${summary.sourceRows} platform_rows=${summary.platformRows} report_rows=${summary.reportRows} state_rows=${summary.stateRows}`,
    `watermark_source/platform/inputs=${summary.watermarkCoversSource}/${summary.watermarkCoversPlatform}/${summary.watermarkCoversInputs}`,
    `latest_active_week=${reconciliation.weekPeriod ?? 'n/a'} rows=${summary.latestExpectedRows}/${summary.latestActualRows} missing=${summary.latestMissingRows} extra=${summary.latestExtraRows} contract_mismatch=${summary.latestContractMismatchRows}`,
    `p1=${result.sourceArtifacts.p1.path} sha256=${result.sourceArtifacts.p1.sha256}`,
    `p1d_probe=${result.sourceArtifacts.p1dProbe.path} sha256=${result.sourceArtifacts.p1dProbe.sha256}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
