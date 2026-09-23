const CONFIRM_FLAG = '--confirm-ledger-exception-owner-overlay';
const VALUE_OPTIONS = new Map([
  ['--decisions', 'decisionsPath'],
  ['--decisions-sha256', 'decisionsSha256'],
  ['--output', 'outputPath'],
  ['--reviewed-at', 'reviewedAt'],
  ['--reviewer', 'reviewer'],
]);

const BLOCKED_OPTIONS = new Set([
  '--apply',
  '--baseline',
  '--deploy',
  '--execute',
  '--write-ledger',
]);

export function parseQianchuanProductionMigrationLedgerExceptionOwnerOverlayArgs(args) {
  const options = Object.fromEntries([...VALUE_OPTIONS.values()].map((field) => [field, null]));
  Object.assign(options, { confirmed: false, help: false });
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === CONFIRM_FLAG) options.confirmed = true;
    else if (BLOCKED_OPTIONS.has(argument)) {
      throw new Error(`${argument} is not supported by the offline ledger exception owner overlay.`);
    } else if (VALUE_OPTIONS.has(argument)) {
      const value = args[index + 1] ?? null;
      index += 1;
      if (!value) throw new Error(`${argument} requires a value.`);
      options[VALUE_OPTIONS.get(argument)] = value;
    } else {
      const matched = [...VALUE_OPTIONS].find(([option]) => argument.startsWith(`${option}=`));
      if (!matched) throw new Error(`Unknown ledger exception owner overlay option: ${argument}.`);
      const value = argument.slice(matched[0].length + 1) || null;
      if (!value) throw new Error(`${matched[0]} requires a value.`);
      options[matched[1]] = value;
    }
  }
  if (!options.help) {
    for (const [option, field] of VALUE_OPTIONS) {
      if (!options[field]) throw new Error(`${option} is required for the offline ledger exception owner overlay.`);
    }
    if (!options.confirmed) {
      throw new Error(`${CONFIRM_FLAG} is required for the offline ledger exception owner overlay.`);
    }
  }
  return options;
}

export function formatQianchuanProductionMigrationLedgerExceptionOwnerOverlay(overlay, artifact) {
  return [
    '[qianchuan-production-migration-ledger-exception-owner-overlay]',
    `mode=${overlay.mode} resolutions=${overlay.summary.resolutions} record_exception=${overlay.summary.ledgerResolutionActions.record_exception}`,
    `exception_kinds=not_applicable:${overlay.summary.exceptionKinds.not_applicable},forward_repaired:${overlay.summary.exceptionKinds.forward_repaired}`,
    `source_historical_execution=explicit_false:${overlay.summary.sourceHistoricalExecutionStates.explicit_false},legacy_unspecified:${overlay.summary.sourceHistoricalExecutionStates.legacy_unspecified}`,
    `runner_contract=${overlay.authorization.runnerContractVersion} production_writes=false ledger_writes=false`,
    `source_decisions=${overlay.sourceArtifacts.ownerDecisions.path} sha256=${overlay.sourceArtifacts.ownerDecisions.sha256}`,
    `artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`,
  ].join('\n');
}
