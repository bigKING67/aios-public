import {
  resolveExternalMigrationAuditArtifactPath,
  writeExclusiveMigrationAuditJson,
} from './aios-migration-audit-artifact.mjs';

export function parseQianchuanProductionMigrationReconciliationArgs(args) {
  const options = {
    help: false,
    json: false,
    outputPath: null,
    requireReconciled: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--require-reconciled') options.requireReconciled = true;
    else if (argument === '--output') {
      options.outputPath = args[index + 1] ?? null;
      index += 1;
      if (!options.outputPath) throw new Error('--output requires an absolute external artifact path.');
    } else if (argument.startsWith('--output=')) {
      options.outputPath = argument.slice('--output='.length);
      if (!options.outputPath) throw new Error('--output requires an absolute external artifact path.');
    } else throw new Error(`Unknown qianchuan migration reconciliation option: ${argument}.`);
  }
  return options;
}

export function resolveExternalReconciliationArtifactPath(outputPath, cwd = process.cwd()) {
  return resolveExternalMigrationAuditArtifactPath(outputPath, cwd);
}

export function writeQianchuanProductionMigrationReconciliationArtifact(
  result,
  outputPath,
  options = {},
) {
  return writeExclusiveMigrationAuditJson(result, outputPath, options);
}

function countText(counts) {
  return Object.entries(counts).map(([key, value]) => `${key}:${value}`).join(',');
}

export function formatQianchuanProductionMigrationReconciliation(result, artifact = null) {
  const target = result.target;
  const lines = [
    '[qianchuan-production-migration-reconciliation]',
    `mode=${result.mode} reconciled=${result.reconciled} ready_for_ledger=${result.readyForLedgerBootstrap}`,
    `inventory=${result.inventory.total} ledger=${result.ledger.exists ? 'present' : 'missing'} recorded=${result.ledger.recordedRows}`,
    `classifications=${countText(result.summary.classifications)}`,
    `schema_evidence=${countText(result.summary.schemaEvidenceStates)}`,
    `target=${target.namespace}/${target.version} classification=${target.classification} ledger=${target.ledgerEvidence.state} live_postcondition=${target.explicitEvidence?.livePostcondition ?? 'unknown'}`,
    `target_core_present=${target.explicitEvidence?.corePresent ?? 0}/${target.explicitEvidence?.core.length ?? 0} target_overlap_present=${target.explicitEvidence?.overlappingPresent ?? 0}/${target.explicitEvidence?.overlapping.length ?? 0}`,
  ];
  if (artifact) lines.push(`artifact=${artifact.path} bytes=${artifact.bytes} sha256=${artifact.sha256}`);
  return lines.join('\n');
}
