const CONFIRM_FLAG = '--confirm-owner-review';

const VALUE_OPTIONS = new Map([
  ['--evidence', 'evidencePath'],
  ['--evidence-sha256', 'evidenceSha256'],
  ['--exception-decisions-output', 'exceptionDecisionsOutputPath'],
  ['--manifest', 'manifestPath'],
  ['--manifest-sha256', 'manifestSha256'],
  ['--owner-decisions-output', 'ownerDecisionsOutputPath'],
  ['--prior-exception-decisions', 'priorDecisionsPath'],
  ['--prior-exception-decisions-sha256', 'priorDecisionsSha256'],
  ['--review-spec', 'reviewSpecPath'],
  ['--review-spec-sha256', 'reviewSpecSha256'],
  ['--reviewed-manifest-output', 'reviewedManifestOutputPath'],
]);

const BLOCKED_OPTIONS = new Set([
  '--apply',
  '--baseline',
  '--commit',
  '--deploy',
  '--execute',
  '--push',
  '--write-ledger',
]);

export function parseAiosProductionMigrationOwnerReviewedOverlayArgs(args) {
  const options = {
    confirmed: false,
    evidencePath: null,
    evidenceSha256: null,
    exceptionDecisionsOutputPath: null,
    help: false,
    manifestPath: null,
    manifestSha256: null,
    ownerDecisionsOutputPath: null,
    priorDecisionsPath: null,
    priorDecisionsSha256: null,
    reviewSpecPath: null,
    reviewSpecSha256: null,
    reviewedManifestOutputPath: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === CONFIRM_FLAG) options.confirmed = true;
    else if (BLOCKED_OPTIONS.has(argument)) {
      throw new Error(`${argument} is not supported by the offline owner-review overlay.`);
    } else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown owner-review overlay option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    if (!options.confirmed) {
      throw new Error(`${CONFIRM_FLAG} is required for the offline owner-review overlay.`);
    }
    for (const [option, field] of VALUE_OPTIONS) {
      if (!options[field]) throw new Error(`${option} is required for the offline owner-review overlay.`);
    }
    const outputs = [
      options.ownerDecisionsOutputPath,
      options.reviewedManifestOutputPath,
      options.exceptionDecisionsOutputPath,
    ];
    if (new Set(outputs).size !== outputs.length) {
      throw new Error('Owner-review overlay output paths must be distinct.');
    }
  }
  return options;
}

export function formatAiosProductionMigrationOwnerReviewedOverlay(result) {
  return [
    '[aios-production-migration-owner-reviewed-overlay]',
    `mode=${result.ownerDecisions.mode} reviewed=${result.ownerDecisions.summary.decisions} applied=${result.ownerDecisions.summary.decisionsByType.applied_and_verified ?? 0} exceptions=${result.ownerDecisions.summary.decisionsByType.not_applicable ?? 0}`,
    `derived_unknown=${result.reviewedManifest.summary.unknown} reconciled=${result.reviewedManifest.reconciled} ready_for_ledger=${result.reviewedManifest.readyForLedgerBootstrap}`,
    `merged_exception_decisions=${result.exceptionDecisions.summary.decisions} new_cohort=${result.exceptionDecisions.authorization.newDecisionCohort}`,
    `owner_decisions=${result.artifacts.ownerDecisions.path} bytes=${result.artifacts.ownerDecisions.bytes} sha256=${result.artifacts.ownerDecisions.sha256}`,
    `reviewed_manifest=${result.artifacts.reviewedManifest.path} bytes=${result.artifacts.reviewedManifest.bytes} sha256=${result.artifacts.reviewedManifest.sha256}`,
    `exception_decisions=${result.artifacts.exceptionDecisions.path} bytes=${result.artifacts.exceptionDecisions.bytes} sha256=${result.artifacts.exceptionDecisions.sha256}`,
    'database_access=false sql_generated=false ledger_writes=false migration_apply=false deploy=false',
  ].join('\n');
}
