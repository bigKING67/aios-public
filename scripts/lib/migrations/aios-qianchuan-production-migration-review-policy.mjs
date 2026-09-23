export const QIANCHUAN_SCHEMA_CONFLICT_STATES = new Set([
  'schema_effects_absent',
  'schema_effects_partial',
]);

export function qianchuanMigrationReviewProbeKinds(entry, { target = false } = {}) {
  const probes = [];
  const add = (probe) => {
    if (!probes.includes(probe)) probes.push(probe);
  };
  if (target) add('target_apply_or_forward_repair_scope_and_execution_provenance');
  if (QIANCHUAN_SCHEMA_CONFLICT_STATES.has(entry.schemaEvidenceState)) {
    add('migration_specific_postcondition_and_supersession_review');
  } else if (entry.schemaEvidenceState === 'schema_effects_present') {
    add('object_definition_fingerprint_and_existing_runtime_evidence');
  } else {
    add('source_runtime_and_topology_provenance');
  }
  if (entry.unsupportedSignals.includes('dml_or_backfill')) add('data_shape_or_backfill_reconciliation');
  if (entry.unsupportedSignals.includes('procedural_body')) add('routine_definition_hash');
  if (entry.unsupportedSignals.includes('dynamic_sql')) add('dynamic_sql_target_and_callsite_review');
  if (entry.unsupportedSignals.includes('rename')) add('rename_lineage_and_dependency_review');
  if ((entry.schemaEvidence?.supersededEffects ?? 0) > 0) add('supersession_chain_review');
  if (['ledger_missing', 'not_recorded'].includes(entry.ledgerEvidence.state)) {
    add('repository_checksum_and_deployment_provenance');
  }
  return probes;
}
