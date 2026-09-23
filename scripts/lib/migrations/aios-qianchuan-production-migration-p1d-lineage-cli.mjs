export function parseQianchuanProductionMigrationP1dLineageArgs(args) {
  const options = {
    help: false,
    json: false,
    manifestPath: null,
    manifestSha256: null,
    outputPath: null,
    p1Path: null,
    p1Sha256: null,
  };
  const fields = new Map([
    ['--manifest', 'manifestPath'],
    ['--manifest-sha256', 'manifestSha256'],
    ['--output', 'outputPath'],
    ['--p1', 'p1Path'],
    ['--p1-sha256', 'p1Sha256'],
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
      const match = argument.match(/^(--manifest|--manifest-sha256|--output|--p1|--p1-sha256)=(.*)$/);
      if (!match) throw new Error(`Unknown qianchuan migration P1D lineage option: ${argument}.`);
      if (!match[2]) throw new Error(`${match[1]} requires a value.`);
      options[fields.get(match[1])] = match[2];
    }
  }
  if (!options.help) {
    for (const [field, label] of [
      ['manifestPath', '--manifest'],
      ['manifestSha256', '--manifest-sha256'],
      ['p1Path', '--p1'],
      ['p1Sha256', '--p1-sha256'],
    ]) {
      if (!options[field]) throw new Error(`${label} is required for the offline P1D lineage packet.`);
    }
  }
  return options;
}

function countText(counts) {
  return Object.entries(counts).map(([key, value]) => `${key}:${value}`).join(',');
}

export function formatQianchuanProductionMigrationP1dLineage(result, artifact = null) {
  const lines = [
    '[qianchuan-production-migration-p1d-lineage]',
    `mode=${result.mode} entries=${result.summary.entries} families=${result.summary.families} related_migrations=${result.summary.relatedMigrationChecksumsVerified} runtime_files=${result.summary.runtimeFilesVerified}`,
    `family_counts=${countText(result.summary.byFamily)}`,
    `manifest=${result.sourceArtifacts.manifest.path} sha256=${result.sourceArtifacts.manifest.sha256}`,
    `p1=${result.sourceArtifacts.p1.path} sha256=${result.sourceArtifacts.p1.sha256}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
