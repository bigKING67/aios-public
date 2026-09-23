const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--p1', 'p1Path'],
  ['--p1-sha256', 'p1Sha256'],
  ['--p1d-probe', 'p1dProbePath'],
  ['--p1d-probe-sha256', 'p1dProbeSha256'],
]);

export function parseQianchuanPlatformVideoIdentityReadonlyProbeArgs(args) {
  const options = {
    help: false,
    outputPath: null,
    p1Path: null,
    p1Sha256: null,
    p1dProbePath: null,
    p1dProbeSha256: null,
    state: 'precontract',
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (['--apply', '--deploy', '--execute', '--json', '--repair', '--write-ledger'].includes(argument)) {
      throw new Error(`${argument} is not supported by the live read-only platform-video identity probe.`);
    }
    else if (argument === '--postinstall') options.state = 'postinstall';
    else if (argument === '--postcontract') options.state = 'postcontract';
    else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown qianchuan platform-video identity probe option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (args.includes('--postinstall') && args.includes('--postcontract')) {
    throw new Error('--postinstall and --postcontract are mutually exclusive.');
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (option !== '--output' && !options[field]) {
        throw new Error(`${option} is required for the live read-only platform-video identity probe.`);
      }
    }
  }
  return options;
}

export function formatQianchuanPlatformVideoIdentityReadonlyProbe(result, artifact = null) {
  const lines = [
    '[qianchuan-platform-video-identity-readonly-probe]',
    `mode=${result.mode} state=${result.summary.contractState} active_rows=${result.summary.activeRows} waiting_locks=${result.summary.waitingLocks}`,
    `global_duplicates=${result.summary.globalVideoDuplicateGroups}/${result.summary.globalVideoDuplicateRows} cross_asset=${result.summary.globalVideoCrossAssetGroups} cross_account=${result.summary.globalVideoCrossAccountGroups}`,
    `fallback_duplicates=${result.summary.fallbackDuplicateGroups}/${result.summary.fallbackDuplicateRows} orphan_material_refs=${result.summary.orphanAdMaterialRefs}`,
    `legacy_equivalent=${result.summary.legacyDefinitionsEquivalent} plan_ready=${result.summary.identityContractPlanReady} postinstall_ready=${result.summary.postinstallReady} postcontract_ready=${result.summary.postcontractReady}`,
    `p1=${result.sourceArtifacts.p1.path} sha256=${result.sourceArtifacts.p1.sha256}`,
    `p1d_probe=${result.sourceArtifacts.p1dProbe.path} sha256=${result.sourceArtifacts.p1dProbe.sha256}`,
  ];
  if (result.sourceArtifacts.forwardInstallMigration) {
    lines.push(
      `forward_install=${result.sourceArtifacts.forwardInstallMigration.identity} sha256=${result.sourceArtifacts.forwardInstallMigration.sha256}`,
    );
  }
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
