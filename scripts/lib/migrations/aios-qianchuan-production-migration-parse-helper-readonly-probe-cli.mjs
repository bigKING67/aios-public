const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--plan', 'planPath'],
  ['--plan-sha256', 'planSha256'],
]);

export function parseQianchuanParseHelperReadonlyProbeArgs(args) {
  const options = {
    help: false,
    outputPath: null,
    planPath: null,
    planSha256: null,
    state: 'preinstall',
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--postinstall') options.state = 'postinstall';
    else if (['--apply', '--baseline', '--deploy', '--execute', '--json', '--remove-runtime-ddl', '--write-ledger'].includes(argument)) {
      throw new Error(`${argument} is not supported by the live read-only parse-helper probe.`);
    } else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown qianchuan parse-helper read-only probe option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (!options[field]) {
        throw new Error(`${option} is required for the live read-only parse-helper probe.`);
      }
    }
  }
  return options;
}

export function formatQianchuanParseHelperReadonlyProbe(result, artifact) {
  return [
    '[qianchuan-parse-helper-readonly-probe]',
    `mode=${result.mode} requested_state=${result.requestedState} helpers=${result.summary.helpersPresent}/${result.summary.exactCatalogHelpers}`,
    `raw/dwd/qianchuan_dwd=${result.summary.rawRows}/${result.summary.dwdRows}/${result.summary.qianchuanDwdRows} waiting_locks=${result.summary.waitingLocks}`,
    `semantic_checks=${result.summary.semanticChecksPassed}/${result.summary.semanticChecksTotal} postinstall_ready=${result.summary.postinstallReady}`,
    `migration=${result.repositoryEvidence.forwardMigration.path} sha256=${result.repositoryEvidence.forwardMigration.sha256}`,
    `plan=${result.sourceArtifacts.plan.path} sha256=${result.sourceArtifacts.plan.sha256}`,
    `artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`,
  ].join('\n');
}
