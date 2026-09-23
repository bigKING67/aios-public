const VALUE_OPTIONS = new Map([
  ['--lineage', 'lineagePath'],
  ['--lineage-sha256', 'lineageSha256'],
  ['--manifest', 'manifestPath'],
  ['--manifest-sha256', 'manifestSha256'],
  ['--output', 'outputPath'],
  ['--prior-decisions', 'priorDecisionsPath'],
  ['--prior-decisions-sha256', 'priorDecisionsSha256'],
  ['--readonly-probe', 'readonlyProbePath'],
  ['--readonly-probe-sha256', 'readonlyProbeSha256'],
  ['--reviewed-at', 'reviewedAt'],
  ['--reviewer', 'reviewer'],
]);

export function parseQianchuanProductionMigrationP1dReviewDecisionArgs(args) {
  const options = {
    help: false,
    json: false,
    lineagePath: null,
    lineageSha256: null,
    manifestPath: null,
    manifestSha256: null,
    outputPath: null,
    priorDecisionsPath: null,
    priorDecisionsSha256: null,
    readonlyProbePath: null,
    readonlyProbeSha256: null,
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
      if (!matched) throw new Error(`Unknown qianchuan migration P1D review decision option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (!options[field]) throw new Error(`${option} is required for the offline P1D owner review decision.`);
    }
  }
  return options;
}

export function formatQianchuanProductionMigrationP1dReviewDecisions(result, artifact) {
  return [
    '[qianchuan-production-migration-p1d-review-decisions]',
    `mode=${result.mode} decisions=${result.summary.decisions} prior=${result.summary.priorDecisions} new_p1d=${result.summary.newDecisions} unresolved_p1d=${result.summary.unresolvedP1dEntries} reviewer=${result.authorization.reviewer}`,
    `review_status=verified_not_applicable:${result.summary.reviewStatuses.verified_not_applicable} ledger_action=do_not_record:${result.summary.ledgerActions.do_not_record}`,
    `manifest=${result.sourceArtifacts.manifest.path} sha256=${result.sourceArtifacts.manifest.sha256}`,
    `prior_decisions=${result.sourceArtifacts.priorDecisions.path} sha256=${result.sourceArtifacts.priorDecisions.sha256}`,
    `lineage=${result.sourceArtifacts.lineage.path} sha256=${result.sourceArtifacts.lineage.sha256}`,
    `readonly_probe=${result.sourceArtifacts.readonlyProbe.path} sha256=${result.sourceArtifacts.readonlyProbe.sha256}`,
    `artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`,
  ].join('\n');
}
