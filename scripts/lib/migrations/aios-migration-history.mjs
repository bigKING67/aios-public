import { AIOS_MIGRATION_LEDGER_EXCEPTION_KINDS } from './aios-migration-ledger-contract.mjs';

function groupByNamespace(values) {
  const groups = new Map();
  for (const value of values) {
    const items = groups.get(value.namespace) ?? [];
    items.push(value);
    groups.set(value.namespace, items);
  }
  return groups;
}

const EXECUTED_MODES = new Set(['transactional', 'self-transactional', 'nontransactional']);
const EXCEPTION_KINDS = new Set(AIOS_MIGRATION_LEDGER_EXCEPTION_KINDS);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function executionMode(row) {
  return row.execution_mode ?? row.executionMode;
}

function exceptionKind(row) {
  return row.exception_kind ?? row.exceptionKind ?? null;
}

function decisionArtifactSha256(row) {
  return row.decision_artifact_sha256 ?? row.decisionArtifactSha256 ?? null;
}

function validateResolution(namespace, expectedRecord, row, ledgerSchemaVersion, failures) {
  const mode = executionMode(row);
  const kind = exceptionKind(row);
  const decisionSha256 = decisionArtifactSha256(row);
  if (mode === 'exception') {
    if (ledgerSchemaVersion !== 2) {
      failures.push(`${namespace}: exception mode requires the v2 ledger read shape for ${row.version}.`);
      return null;
    }
    if (!EXCEPTION_KINDS.has(kind) || !SHA256_PATTERN.test(decisionSha256 ?? '')) {
      failures.push(`${namespace}: invalid exception metadata for ${row.version}.`);
      return null;
    }
    return 'excepted';
  }
  if (kind !== null || decisionSha256 !== null) {
    failures.push(`${namespace}: non-exception row has exception metadata for ${row.version}.`);
    return null;
  }
  if (mode === 'baseline') return 'baselined';
  if (EXECUTED_MODES.has(mode) && mode === expectedRecord.executionMode) return 'executed';
  failures.push(
    `${namespace}: execution mode drift for ${row.version}: ledger=${mode ?? 'missing'}, `
    + `expected=${expectedRecord.executionMode}|baseline|exception.`,
  );
  return null;
}

export function compareAiosMigrationHistory(
  records,
  appliedRows,
  { ledgerSchemaVersion = 1, requireNoPending = false } = {},
) {
  const filesystem = groupByNamespace(records);
  const applied = groupByNamespace(appliedRows);
  const failures = [];
  const namespaces = [...new Set([...filesystem.keys(), ...applied.keys()])].sort();
  const summaries = [];

  for (const namespace of namespaces) {
    const expected = filesystem.get(namespace) ?? [];
    const actual = applied.get(namespace) ?? [];
    const seen = new Set();
    const resolutionCounts = { executed: 0, baselined: 0, excepted: 0 };
    for (const [index, row] of actual.entries()) {
      if (seen.has(row.version)) failures.push(`${namespace}: duplicate ledger version ${row.version}.`);
      seen.add(row.version);
      const expectedRecord = expected[index];
      if (!expectedRecord || expectedRecord.version !== row.version) {
        failures.push(`${namespace}: ledger history is not a filesystem prefix at ${row.version}.`);
        continue;
      }
      if (expectedRecord.checksum !== row.checksum) {
        failures.push(`${namespace}: checksum drift for ${row.version}.`);
      }
      const resolution = validateResolution(
        namespace,
        expectedRecord,
        row,
        ledgerSchemaVersion,
        failures,
      );
      if (resolution) resolutionCounts[resolution] += 1;
    }
    const pending = expected.slice(actual.length);
    if (requireNoPending && pending.length) {
      failures.push(`${namespace}: ${pending.length} pending migration(s) remain.`);
    }
    summaries.push({
      namespace,
      applied: actual.length,
      resolved: resolutionCounts.executed + resolutionCounts.baselined + resolutionCounts.excepted,
      executed: resolutionCounts.executed,
      baselined: resolutionCounts.baselined,
      excepted: resolutionCounts.excepted,
      pending: pending.length,
      total: expected.length,
      pendingRecords: pending,
    });
  }
  return { failures, ledgerSchemaVersion, summaries };
}

export function assertAiosMigrationHistory(records, appliedRows, options) {
  const comparison = compareAiosMigrationHistory(records, appliedRows, options);
  if (comparison.failures.length) throw new Error(comparison.failures.join('\n'));
  return comparison;
}
