import { compareAiosMigrationHistory } from './aios-migration-history.mjs';
import { summarizeAiosMigrations } from './aios-migration-discovery.mjs';
import { queryAiosMigrationCatalogEffects } from './aios-migration-reconciliation-catalog.mjs';
import { analyzeAiosMigrationStaticEvidence } from './aios-migration-reconciliation-static.mjs';
import { withAiosReadOnlyTransaction } from './aios-readonly-audit.mjs';
import {
  QIANCHUAN_CUTOVER_OVERLAPPING_VIDEO_RELATIONS,
  QIANCHUAN_CUTOVER_TARGET_AD_MATERIAL_COLUMNS,
  QIANCHUAN_CUTOVER_TARGET_MIGRATION,
  QIANCHUAN_CUTOVER_TARGET_RELATIONS,
} from './aios-qianchuan-production-cutover-readiness.mjs';

const LEDGER_PRESENCE_SQL = `/* aios_migration_reconciliation:ledger_presence */
SELECT to_regclass('public.aios_schema_migrations') IS NOT NULL AS present`;

const LEDGER_SQL = `/* aios_migration_reconciliation:ledger */
SELECT namespace, version, checksum, applied_at, app_version, execution_mode
FROM public.aios_schema_migrations
ORDER BY namespace, applied_at, version`;

function numericSummary(values, selector) {
  const summary = {};
  for (const value of values) {
    const key = selector(value);
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(summary).sort(([left], [right]) => left.localeCompare(right)));
}

function inventory(records) {
  const namespaces = summarizeAiosMigrations(records);
  return {
    total: records.length,
    namespaces: Object.fromEntries(Object.entries(namespaces).map(([namespace, summary]) => [namespace, {
      bytes: summary.bytes,
      modes: summary.modes,
      total: summary.total,
    }])),
  };
}

function ledgerStateFor(ledgerExists, rows, analysis) {
  if (!ledgerExists) return { recordedChecksum: null, state: 'ledger_missing' };
  const matches = rows.filter((row) => (
    row.namespace === analysis.namespace && row.version === analysis.version
  ));
  if (!matches.length) return { recordedChecksum: null, state: 'not_recorded' };
  if (matches.length > 1) return { recordedChecksum: matches[0]?.checksum ?? null, state: 'duplicate_records' };
  return {
    appliedAt: matches[0].applied_at ?? null,
    recordedChecksum: matches[0].checksum ?? null,
    state: matches[0].checksum === analysis.checksum ? 'recorded_matching' : 'checksum_mismatch',
  };
}

function schemaEvidenceFor(effects, presence) {
  const currentEffects = effects.filter((effect) => !effect.supersededBy);
  if (!currentEffects.length) {
    return {
      currentEffects: 0,
      satisfiedEffects: 0,
      state: 'unprobeable',
      supersededEffects: effects.length,
    };
  }
  const satisfiedEffects = currentEffects.filter((effect) => (
    presence.get(effect.key) === effect.expectedPresent
  )).length;
  const state = satisfiedEffects === currentEffects.length
    ? 'schema_effects_present'
    : satisfiedEffects === 0
      ? 'schema_effects_absent'
      : 'schema_effects_partial';
  return {
    currentEffects: currentEffects.length,
    satisfiedEffects,
    state,
    supersededEffects: effects.length - currentEffects.length,
  };
}

function targetEffectKeys() {
  return {
    core: [
      ...QIANCHUAN_CUTOVER_TARGET_RELATIONS.map((relation) => `relation:${relation}`),
      ...QIANCHUAN_CUTOVER_TARGET_AD_MATERIAL_COLUMNS.map((column) => (
        `column:ads.marketing_content_ad_materials.${column}`
      )),
    ],
    overlapping: QIANCHUAN_CUTOVER_OVERLAPPING_VIDEO_RELATIONS.map((relation) => `relation:${relation}`),
  };
}

function explicitTargetEvidence(analysis, presence) {
  if (analysis.namespace !== QIANCHUAN_CUTOVER_TARGET_MIGRATION.namespace
    || analysis.version !== QIANCHUAN_CUTOVER_TARGET_MIGRATION.version) return null;
  const keys = targetEffectKeys();
  const core = keys.core.map((key) => ({ key, present: presence.get(key) === true }));
  const overlapping = keys.overlapping.map((key) => ({ key, present: presence.get(key) === true }));
  const corePresent = core.filter((effect) => effect.present).length;
  const overlappingPresent = overlapping.filter((effect) => effect.present).length;
  let livePostcondition = 'unknown';
  if (corePresent === 0 && overlappingPresent === 0) livePostcondition = 'missing';
  else if (corePresent < core.length && (corePresent > 0 || overlappingPresent > 0)) {
    livePostcondition = 'partially_applied';
  } else if (corePresent === core.length && overlappingPresent === overlapping.length) {
    livePostcondition = 'schema_effects_present';
  }
  return {
    core,
    corePresent,
    livePostcondition,
    overlapping,
    overlappingPresent,
    provenanceLimit: 'Overlapping video storage may be supplied by warehouse/20260713_1100.',
  };
}

function classify({ explicitEvidence, ledgerEvidence, schemaEvidence }) {
  if (explicitEvidence?.livePostcondition === 'partially_applied') {
    return {
      candidateClassification: 'partially_applied',
      classification: 'partially_applied',
      rationale: 'Core qianchuan effects are missing while overlapping video-storage effects are present; original execution remains unproven.',
    };
  }
  if (explicitEvidence?.livePostcondition === 'missing'
    && ['ledger_missing', 'not_recorded'].includes(ledgerEvidence.state)) {
    return {
      candidateClassification: 'missing',
      classification: 'missing',
      rationale: 'The explicit target probe found none of the target core or overlapping schema effects.',
    };
  }
  if (ledgerEvidence.state === 'recorded_matching') {
    if (['schema_effects_absent', 'schema_effects_partial'].includes(schemaEvidence.state)) {
      return {
        candidateClassification: 'partially_applied',
        classification: 'partially_applied',
        rationale: 'The ledger checksum matches, but current non-superseded schema postconditions are incomplete.',
      };
    }
  }
  return {
    candidateClassification: 'unknown',
    classification: 'unknown',
    rationale: 'Catalog state alone cannot prove this migration executed; decisive migration-specific evidence is still required.',
  };
}

function reviewStatus(classification, ledgerState) {
  if (classification === 'applied_and_verified') return 'verified';
  if (classification === 'partially_applied' || classification === 'missing') return 'decisive_postcondition_reviewed';
  if (ledgerState === 'checksum_mismatch' || ledgerState === 'duplicate_records') return 'ledger_inconsistency_review_required';
  return 'manual_review_required';
}

function ledgerAction(classification, ledgerState) {
  if (classification === 'applied_and_verified') {
    return ledgerState === 'recorded_matching' ? 'retain_matching_record' : 'eligible_for_selective_recording';
  }
  if (classification === 'partially_applied' || classification === 'missing') return 'do_not_record';
  if (ledgerState === 'recorded_matching') return 'review_recorded_entry';
  return 'withhold_pending_proof';
}

function manifestEntry(analysis, ledgerExists, ledgerRows, presence) {
  const ledgerEvidence = ledgerStateFor(ledgerExists, ledgerRows, analysis);
  const schemaEvidence = schemaEvidenceFor(analysis.catalogEffects, presence);
  const explicitEvidence = explicitTargetEvidence(analysis, presence);
  const classification = classify({ explicitEvidence, ledgerEvidence, schemaEvidence });
  return {
    namespace: analysis.namespace,
    version: analysis.version,
    checksum: analysis.checksum,
    relativePath: analysis.relativePath,
    executionMode: analysis.executionMode,
    sizeBytes: analysis.sizeBytes,
    signals: analysis.signals,
    unsupportedSignals: analysis.unsupportedSignals,
    catalogEffects: analysis.catalogEffects.map((effect) => {
      const present = presence.get(effect.key) ?? null;
      return {
        ...effect,
        present,
        satisfied: present === null ? null : present === effect.expectedPresent,
      };
    }),
    ledgerEvidence,
    executionEvidenceState: ledgerEvidence.state === 'recorded_matching' ? 'recorded_matching' : 'unknown',
    schemaEvidenceState: schemaEvidence.state,
    schemaEvidence,
    explicitEvidence,
    ...classification,
    reviewStatus: reviewStatus(classification.classification, ledgerEvidence.state),
    reviewer: null,
    ledgerAction: ledgerAction(classification.classification, ledgerEvidence.state),
  };
}

function buildSummary(entries) {
  const classifications = numericSummary(entries, (entry) => entry.classification);
  return {
    classifications,
    ledgerActions: numericSummary(entries, (entry) => entry.ledgerAction),
    reviewStatuses: numericSummary(entries, (entry) => entry.reviewStatus),
    schemaEvidenceStates: numericSummary(entries, (entry) => entry.schemaEvidenceState),
    unknown: classifications.unknown ?? 0,
  };
}

export function qianchuanProductionMigrationReconciliationExitCode(result, requireReconciled) {
  return requireReconciled && !result.reconciled ? 1 : 0;
}

export async function runQianchuanProductionMigrationReconciliation({
  client,
  descriptor,
  now = () => new Date(),
  readFile,
  records,
  statementTimeoutMs = 15000,
}) {
  if (descriptor.ledgerTable !== 'public.aios_schema_migrations') {
    throw new Error(`Unsupported migration ledger table: ${descriptor.ledgerTable}.`);
  }
  const analyses = analyzeAiosMigrationStaticEvidence(records, { readFile });

  return withAiosReadOnlyTransaction(client, { statementTimeoutMs }, async () => {
    const ledgerExists = (await client.query(LEDGER_PRESENCE_SQL)).rows?.[0]?.present === true;
    const ledgerRows = ledgerExists ? (await client.query(LEDGER_SQL)).rows ?? [] : [];
    const history = ledgerExists
      ? compareAiosMigrationHistory(records, ledgerRows)
      : { failures: [], summaries: [] };
    const presence = await queryAiosMigrationCatalogEffects(
      client,
      analyses.flatMap((analysis) => analysis.catalogEffects),
    );
    const entries = analyses.map((analysis) => manifestEntry(
      analysis,
      ledgerExists,
      ledgerRows,
      presence,
    ));
    const summary = buildSummary(entries);
    const target = entries.find((entry) => (
      entry.namespace === QIANCHUAN_CUTOVER_TARGET_MIGRATION.namespace
      && entry.version === QIANCHUAN_CUTOVER_TARGET_MIGRATION.version
    ));
    if (!target) throw new Error(`Target migration ${QIANCHUAN_CUTOVER_TARGET_MIGRATION.version} was not discovered.`);

    return {
      schemaVersion: 1,
      auditedAt: now().toISOString(),
      mode: 'live_readonly',
      readOnlyTransaction: true,
      statementTimeoutMs: Math.trunc(statementTimeoutMs),
      inventory: inventory(records),
      ledger: {
        exists: ledgerExists,
        recordedRows: ledgerRows.length,
        historyFailures: history.failures,
        namespaceSummaries: history.summaries.map((item) => ({
          namespace: item.namespace,
          applied: item.applied,
          pending: item.pending,
          total: item.total,
        })),
      },
      entries,
      summary,
      reconciled: summary.unknown === 0,
      readyForLedgerBootstrap: summary.unknown === 0
        && (summary.classifications.partially_applied ?? 0) === 0
        && (summary.classifications.missing ?? 0) === 0
        && history.failures.length === 0,
      target,
    };
  });
}
