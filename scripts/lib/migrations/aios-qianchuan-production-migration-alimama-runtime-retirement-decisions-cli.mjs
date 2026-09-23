const CONFIRM_FLAG = '--confirm-alimama-runtime-retirement-decision';
const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--plan', 'planPath'],
  ['--plan-sha256', 'planSha256'],
  ['--prior-decisions', 'priorDecisionsPath'],
  ['--prior-decisions-sha256', 'priorDecisionsSha256'],
  ['--probe', 'probePath'],
  ['--probe-sha256', 'probeSha256'],
  ['--reviewed-at', 'reviewedAt'],
  ['--reviewer', 'reviewer'],
]);

export function parseQianchuanAlimamaRuntimeRetirementDecisionArgs(args) {
  const options = Object.fromEntries([...VALUE_OPTIONS.values()].map((field) => [field, null]));
  Object.assign(options, { confirmed: false, help: false, json: false });
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else if (argument === CONFIRM_FLAG) options.confirmed = true;
    else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown Alimama runtime retirement decision option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (!options[field]) throw new Error(`${option} is required for the offline Alimama owner decision.`);
    }
    if (!options.confirmed) {
      throw new Error(`${CONFIRM_FLAG} is required for the offline Alimama owner decision.`);
    }
  }
  return options;
}

export function formatQianchuanAlimamaRuntimeRetirementDecisions(result, artifact) {
  return [
    '[qianchuan-alimama-runtime-retirement-decisions]',
    `mode=${result.mode} decisions=${result.summary.decisions} prior=${result.summary.priorDecisions} new=${result.summary.newDecisions} unresolved_p1d=${result.summary.unresolvedP1dEntries}`,
    `decision=not_applicable:1 historical_execution=false ledger_action=do_not_record:${result.summary.ledgerActions.do_not_record}`,
    `prior_decisions=${result.sourceArtifacts.priorDecisions.path} sha256=${result.sourceArtifacts.priorDecisions.sha256}`,
    `probe=${result.sourceArtifacts.probe.path} sha256=${result.sourceArtifacts.probe.sha256}`,
    `plan=${result.sourceArtifacts.plan.path} sha256=${result.sourceArtifacts.plan.sha256}`,
    `artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`,
  ].join('\n');
}
