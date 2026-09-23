const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--probe', 'probePath'],
  ['--probe-sha256', 'probeSha256'],
]);

export function parseQianchuanParseHelperForwardContractPlanArgs(args) {
  const options = {
    help: false,
    outputPath: null,
    probePath: null,
    probeSha256: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown qianchuan parse-helper plan option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (option !== '--output' && !options[field]) {
        throw new Error(`${option} is required for the offline parse-helper plan.`);
      }
    }
  }
  return options;
}

export function formatQianchuanParseHelperForwardContractPlan(plan, artifact = null) {
  const lines = [
    '[qianchuan-parse-helper-forward-contract-plan]',
    `mode=${plan.mode} ready=${plan.decision.forwardContractPlanReady} strategy=${plan.decision.recommendedStrategy}`,
    `helpers_present=${plan.observed.helpersPresent} raw_rows=${plan.observed.rawRows} dwd_rows=${plan.observed.dwdRows} qianchuan_dwd_rows=${plan.observed.qianchuanDwdRows}`,
    `function_count=${plan.execution.forwardMigration.functions.length} definition_sha256=${plan.execution.forwardMigration.definitionSha256}`,
    `runtime_sha256=${plan.repositoryEvidence.runtime.sha256} self_ddl_call=${plan.repositoryEvidence.runtime.selfProvisioningCallCount} runtime_ddl_functions=${plan.repositoryEvidence.runtime.runtimeDdlFunctionCount}`,
    `probe=${plan.sourceArtifact.path} sha256=${plan.sourceArtifact.sha256}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
