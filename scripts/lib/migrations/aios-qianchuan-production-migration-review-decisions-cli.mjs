const VALUE_OPTIONS = new Map([
  ['--evidence', 'evidencePath'],
  ['--evidence-sha256', 'evidenceSha256'],
  ['--manifest', 'manifestPath'],
  ['--manifest-sha256', 'manifestSha256'],
  ['--output', 'outputPath'],
  ['--reviewed-at', 'reviewedAt'],
  ['--reviewer', 'reviewer'],
]);

export function parseQianchuanProductionMigrationReviewDecisionArgs(args) {
  const options = {
    evidencePath: null,
    evidenceSha256: null,
    help: false,
    json: false,
    manifestPath: null,
    manifestSha256: null,
    outputPath: null,
    reviewedAt: null,
    reviewer: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown qianchuan migration review decision option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (!options[field]) throw new Error(`${option} is required for the offline owner review decision.`);
    }
  }
  return options;
}

export function formatQianchuanProductionMigrationReviewDecisions(result, artifact) {
  return [
    '[qianchuan-production-migration-review-decisions]',
    `mode=${result.mode} decisions=${result.summary.decisions} reviewer=${result.authorization.reviewer}`,
    `review_status=verified_not_applicable:${result.summary.reviewStatuses.verified_not_applicable} ledger_action=do_not_record:${result.summary.ledgerActions.do_not_record}`,
    `manifest=${result.sourceArtifacts.manifest.path} sha256=${result.sourceArtifacts.manifest.sha256}`,
    `evidence=${result.sourceArtifacts.evidence.path} sha256=${result.sourceArtifacts.evidence.sha256}`,
    `artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`,
  ].join('\n');
}
