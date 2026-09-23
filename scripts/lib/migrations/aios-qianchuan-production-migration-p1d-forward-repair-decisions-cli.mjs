const CONFIRM_FLAG = '--confirm-card-ratio-forward-repair-decision';
const VALUE_OPTIONS = new Map([
  ['--output', 'outputPath'],
  ['--owner-review-probe', 'ownerReviewProbePath'],
  ['--owner-review-probe-sha256', 'ownerReviewProbeSha256'],
  ['--postcheck-probe', 'postcheckProbePath'],
  ['--postcheck-probe-sha256', 'postcheckProbeSha256'],
  ['--prior-decisions', 'priorDecisionsPath'],
  ['--prior-decisions-sha256', 'priorDecisionsSha256'],
  ['--reviewed-at', 'reviewedAt'],
  ['--reviewer', 'reviewer'],
  ['--stage2-checkpoint', 'stage2CheckpointPath'],
  ['--stage2-checkpoint-sha256', 'stage2CheckpointSha256'],
]);

export function parseQianchuanProductionMigrationP1dForwardRepairDecisionArgs(args) {
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
      if (!matched) throw new Error(`Unknown qianchuan P1D forward-repair decision option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (!options[field]) throw new Error(`${option} is required for the offline forward-repair decision.`);
    }
    if (!options.confirmed) {
      throw new Error(`${CONFIRM_FLAG} is required for the offline forward-repair decision.`);
    }
  }
  return options;
}

export function formatQianchuanProductionMigrationP1dForwardRepairDecisions(result, artifact) {
  return [
    '[qianchuan-production-migration-p1d-forward-repair-decisions]',
    `mode=${result.mode} decisions=${result.summary.decisions} prior=${result.summary.priorDecisions} new=${result.summary.newDecisions} unresolved_p1d=${result.summary.unresolvedP1dEntries}`,
    `decision=verified_forward_repaired:1 historical_execution=false ledger_action=do_not_record:${result.summary.ledgerActions.do_not_record}`,
    `prior_decisions=${result.sourceArtifacts.priorDecisions.path} sha256=${result.sourceArtifacts.priorDecisions.sha256}`,
    `owner_review_probe=${result.sourceArtifacts.ownerReviewProbe.path} sha256=${result.sourceArtifacts.ownerReviewProbe.sha256}`,
    `stage2_checkpoint=${result.sourceArtifacts.stage2Checkpoint.path} sha256=${result.sourceArtifacts.stage2Checkpoint.sha256}`,
    `postcheck_probe=${result.sourceArtifacts.postcheckProbe.path} sha256=${result.sourceArtifacts.postcheckProbe.sha256}`,
    `artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`,
  ].join('\n');
}
