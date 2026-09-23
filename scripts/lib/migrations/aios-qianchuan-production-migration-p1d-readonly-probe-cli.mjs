export function parseQianchuanProductionMigrationP1dReadonlyProbeArgs(args) {
  const options = {
    help: false,
    json: false,
    lineagePath: null,
    lineageSha256: null,
    outputPath: null,
  };
  const fields = new Map([
    ['--lineage', 'lineagePath'],
    ['--lineage-sha256', 'lineageSha256'],
    ['--output', 'outputPath'],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else if (fields.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[fields.get(argument)] = value;
    } else {
      const match = argument.match(/^(--lineage|--lineage-sha256|--output)=(.*)$/);
      if (!match) throw new Error(`Unknown qianchuan migration P1D read-only probe option: ${argument}.`);
      if (!match[2]) throw new Error(`${match[1]} requires a value.`);
      options[fields.get(match[1])] = match[2];
    }
  }
  if (!options.help && !options.lineagePath) {
    throw new Error('--lineage is required for the live read-only P1D probe.');
  }
  if (!options.help && !options.lineageSha256) {
    throw new Error('--lineage-sha256 is required for the live read-only P1D probe.');
  }
  return options;
}

export function formatQianchuanProductionMigrationP1dReadonlyProbe(result, artifact = null) {
  const states = Object.entries(result.summary.byEvidenceState)
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
  const lines = [
    '[qianchuan-production-migration-p1d-readonly-probe]',
    `mode=${result.mode} entries=${result.summary.entries} families=${result.summary.families} owner_decision_ready=${result.summary.ownerDecisionReady}`,
    `evidence_states=${states}`,
    `source=${result.sourceArtifact.path} sha256=${result.sourceArtifact.sha256}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
