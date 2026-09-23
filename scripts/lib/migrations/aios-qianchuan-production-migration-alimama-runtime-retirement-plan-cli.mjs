const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--probe', 'probePath'],
  ['--probe-sha256', 'probeSha256'],
]);

export function parseQianchuanAlimamaRuntimeRetirementPlanArgs(args) {
  const options = { help: false, outputPath: null, probePath: null, probeSha256: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (['--apply', '--deploy', '--execute', '--json', '--repair', '--write-ledger'].includes(argument)) {
      throw new Error(`${argument} is not supported by the offline Alimama runtime retirement plan.`);
    } else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown Alimama runtime retirement plan option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (option !== '--output' && !options[field]) {
        throw new Error(`${option} is required for the offline Alimama runtime retirement plan.`);
      }
    }
  }
  return options;
}

export function formatQianchuanAlimamaRuntimeRetirementPlan(plan, artifact = null) {
  const lines = [
    '[qianchuan-alimama-runtime-retirement-plan]',
    `mode=${plan.mode} ready=${plan.summary.retirementRecommendationReady} owner_decision=${plan.recommendation.recommendedOwnerDecision}`,
    `legacy_runtime_matches=${plan.summary.legacyRuntimeMatches} active_consumer_files=${plan.summary.activeRuntimeConsumerFiles}`,
    `historical_execution=${plan.recommendation.historicalExecution} replay=${plan.recommendation.historicalMigrationReplayRecommended} restore_legacy=${plan.recommendation.restoreLegacyDwdDwsAdsRecommended}`,
    `migration_sql=${plan.summary.migrationSqlStatements} data_mutation_rows=${plan.summary.dataMutationRows} ledger=${plan.recommendation.ledgerAction}`,
    `probe=${plan.sourceArtifacts.probe.path} sha256=${plan.sourceArtifacts.probe.sha256}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
