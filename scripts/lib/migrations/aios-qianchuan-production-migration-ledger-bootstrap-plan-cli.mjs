const VALUE_OPTIONS = new Map([
  ['--decisions', 'decisionsPath'],
  ['--decisions-sha256', 'decisionsSha256'],
  ['--exception-overlay', 'exceptionOverlayPath'],
  ['--exception-overlay-sha256', 'exceptionOverlaySha256'],
  ['--manifest', 'manifestPath'],
  ['--manifest-sha256', 'manifestSha256'],
  ['--output', 'outputPath'],
]);

const BLOCKED_OPTIONS = new Set([
  '--apply',
  '--baseline',
  '--deploy',
  '--execute',
  '--json',
  '--write-ledger',
]);

export function parseQianchuanProductionMigrationLedgerBootstrapPlanArgs(args) {
  const options = {
    decisionsPath: null,
    decisionsSha256: null,
    exceptionOverlayPath: null,
    exceptionOverlaySha256: null,
    help: false,
    manifestPath: null,
    manifestSha256: null,
    outputPath: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (BLOCKED_OPTIONS.has(argument)) {
      throw new Error(`${argument} is not supported by the offline ledger bootstrap plan.`);
    } else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown ledger bootstrap plan option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (!options[field]) throw new Error(`${option} is required for the offline ledger bootstrap plan.`);
    }
  }
  return options;
}

export function formatQianchuanProductionMigrationLedgerBootstrapPlan(plan, artifact) {
  const blockerCodes = plan.blockers.map((value) => value.code).join(',') || 'none';
  return [
    '[qianchuan-production-migration-ledger-bootstrap-plan]',
    `mode=${plan.mode} bootstrap_prefix_ready=${plan.summary.bootstrapPrefixReady} write_plan_ready=${plan.summary.writePlanReady} targeted_apply_ready=${plan.summary.targetedApplyReady} targeted_apply_after_bootstrap=${plan.summary.targetedApplyReadyAfterBootstrap}`,
    `inventory=${plan.repositoryEvidence.inventory.total} decisions=${plan.sourceState.rebasedOwnerDecisions} overlay_resolutions=${plan.sourceState.rebasedExceptionResolutions} eligible=${plan.summary.categories.ledger_eligible} exceptions=${plan.summary.categories.exception_eligible} unresolved=${plan.summary.categories.unresolved}`,
    `strict_prefix=backend:${plan.strictPrefix.backend}/warehouse:${plan.strictPrefix.warehouse} ledger_rows=${plan.summary.ledgerRows}`,
    `runner_exception_channel=${plan.summary.runnerExceptionChannelSupported} schema_writer_v=${plan.repositoryEvidence.runner.ledgerSchemaWriterVersion} writer_implemented=${plan.repositoryEvidence.runner.writerImplemented} blockers=${blockerCodes}`,
    `target=${plan.target.identity} predecessor_unresolved=${plan.target.predecessorsByCategory.unresolved} predecessor_exceptions=${plan.target.predecessorsByCategory.exception_eligible}`,
    `manifest=${plan.sourceArtifacts.manifest.path} sha256=${plan.sourceArtifacts.manifest.sha256}`,
    `decisions=${plan.sourceArtifacts.decisions.path} sha256=${plan.sourceArtifacts.decisions.sha256}`,
    `exception_overlay=${plan.sourceArtifacts.exceptionOverlay.path} sha256=${plan.sourceArtifacts.exceptionOverlay.sha256}`,
    `artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`,
  ].join('\n');
}
