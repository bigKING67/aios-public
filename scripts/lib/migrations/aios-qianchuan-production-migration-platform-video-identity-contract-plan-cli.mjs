const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--probe', 'probePath'],
  ['--probe-sha256', 'probeSha256'],
]);

export function parseQianchuanPlatformVideoIdentityContractPlanArgs(args) {
  const options = { help: false, outputPath: null, probePath: null, probeSha256: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (['--apply', '--deploy', '--execute', '--write-ledger', '--repair'].includes(argument)
      || argument === '--json') {
      throw new Error(`${argument} is not supported by the offline platform-video identity plan.`);
    } else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown qianchuan platform-video identity plan option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (option !== '--output' && !options[field]) {
        throw new Error(`${option} is required for the offline platform-video identity plan.`);
      }
    }
  }
  return options;
}

export function formatQianchuanPlatformVideoIdentityContractPlan(plan, artifact = null) {
  const lines = [
    '[qianchuan-platform-video-identity-contract-plan]',
    `mode=${plan.mode} ready=${plan.summary.identityContractPlanReady} active_rows=${plan.currentEvidence.activeRows}`,
    `identity=platform+external_video_id scope=${plan.decision.externalVideoScope} asset_component=${plan.decision.assetIdIsIdentityComponent}`,
    `new_indexes=${plan.summary.newIndexes} redundant_indexes=${plan.summary.redundantIndexesToRemove} dml_rows=${plan.summary.dataMutationRows} postchecks=${plan.summary.requiredIndependentPostchecks}`,
    `install_sha256=${plan.migrations.installCanonicalGuards.sha256} cleanup_sha256=${plan.migrations.removeRedundantLegacyGuards.sha256}`,
    `probe=${plan.sourceArtifacts.probe.path} sha256=${plan.sourceArtifacts.probe.sha256}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
