export const QIANCHUAN_CARD_RATIO_MAIN_TABLE = 'ads.douyin_trade_sale_card';
export const QIANCHUAN_CARD_RATIO_DETAIL_TABLE = 'ads.douyin_trade_sale_card_detail';
export const QIANCHUAN_CARD_RATIO_STAGE2_TABLES = Object.freeze([
  QIANCHUAN_CARD_RATIO_MAIN_TABLE,
  QIANCHUAN_CARD_RATIO_DETAIL_TABLE,
]);

const PARITY_TABLE_BY_SHAPE = Object.freeze({
  detail: QIANCHUAN_CARD_RATIO_DETAIL_TABLE,
  main: QIANCHUAN_CARD_RATIO_MAIN_TABLE,
});

function asCount(value, label) {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return count;
}

function emptyCounts() {
  return Object.fromEntries(QIANCHUAN_CARD_RATIO_STAGE2_TABLES.map((table) => [table, 0]));
}

function indexBy(values, field) {
  return new Map((values ?? []).map((value) => [value[field], value]));
}

function totalCounts(counts) {
  return QIANCHUAN_CARD_RATIO_STAGE2_TABLES.reduce(
    (sum, table) => sum + asCount(counts[table], `${table} count`),
    0,
  );
}

export function initialQianchuanCardRatioSourceRows(plan) {
  const tables = indexBy(plan.execution?.batching?.tables, 'table');
  if (tables.size !== QIANCHUAN_CARD_RATIO_STAGE2_TABLES.length
    || QIANCHUAN_CARD_RATIO_STAGE2_TABLES.some((table) => !tables.has(table))) {
    throw new Error('Stage 2 requires exactly two planned source-row boundaries.');
  }
  return Object.fromEntries(QIANCHUAN_CARD_RATIO_STAGE2_TABLES.map((table) => [
    table,
    asCount(tables.get(table).rows, `${table} planned source rows`),
  ]));
}

export function assertQianchuanCardRatioCleanParity(rows, label) {
  if (!Array.isArray(rows) || rows.length !== 2) {
    throw new Error(`${label} must contain main and detail parity rows.`);
  }
  const byShape = indexBy(rows, 'shape');
  if (byShape.size !== 2 || Object.keys(PARITY_TABLE_BY_SHAPE).some((shape) => !byShape.has(shape))) {
    throw new Error(`${label} must contain unique main and detail parity rows.`);
  }
  return Object.fromEntries(Object.entries(PARITY_TABLE_BY_SHAPE).map(([shape, table]) => {
    const row = byShape.get(shape);
    const sourceRows = asCount(row.source_rows ?? row.sourceRows, `${label} ${shape} source rows`);
    if (sourceRows !== asCount(row.target_rows ?? row.targetRows, `${label} ${shape} target rows`)
      || asCount(row.missing_target_rows ?? row.missingTargetRows, `${label} missing rows`) !== 0
      || asCount(row.extra_target_rows ?? row.extraTargetRows, `${label} extra rows`) !== 0
      || asCount(
        row.base_metric_mismatch_rows ?? row.baseMetricMismatchRows,
        `${label} base metric mismatches`,
      ) !== 0) {
      throw new Error(`${label} is not clean.`);
    }
    return [table, sourceRows];
  }));
}

export function assertQianchuanCardRatioSourceCounts(actual, expected, label) {
  for (const table of QIANCHUAN_CARD_RATIO_STAGE2_TABLES) {
    if (asCount(actual[table], `${label} ${table}`)
        !== asCount(expected[table], `${label} expected ${table}`)) {
      throw new Error(`${label} source row count changed for ${table}.`);
    }
  }
  return actual;
}

function countSourceGrowth(expected, actual, label) {
  return Object.fromEntries(QIANCHUAN_CARD_RATIO_STAGE2_TABLES.map((table) => {
    const expectedCount = asCount(expected[table], `${label} expected ${table}`);
    const actualCount = asCount(actual[table], `${label} ${table}`);
    if (actualCount < expectedCount) {
      throw new Error(`${label} source row count decreased for ${table}.`);
    }
    return [table, actualCount - expectedCount];
  }));
}

export function resolveQianchuanCardRatioProbeSourceBoundary(
  probe,
  expectedSourceRowsByTable,
  expectedOdsMismatchRows,
  label,
  { allowGrowth = false } = {},
) {
  const sourceRowsByTable = assertQianchuanCardRatioCleanParity(
    probe.parity,
    `${label} ODS-to-ADS parity`,
  );
  let sourceGrowthRowsByTable;
  if (allowGrowth) {
    sourceGrowthRowsByTable = countSourceGrowth(expectedSourceRowsByTable, sourceRowsByTable, label);
  } else {
    assertQianchuanCardRatioSourceCounts(sourceRowsByTable, expectedSourceRowsByTable, label);
    sourceGrowthRowsByTable = emptyCounts();
  }
  const sourceGrowthRows = totalCounts(sourceGrowthRowsByTable);
  const odsMismatchRows = asCount(probe.summary?.odsMismatchRows, `${label} ODS mismatches`);
  const odsMismatchDelta = odsMismatchRows
    - asCount(expectedOdsMismatchRows, `${label} expected ODS mismatches`);
  if (odsMismatchDelta < 0 || odsMismatchDelta > sourceGrowthRows) {
    throw new Error(`${label} ODS mismatch drift is not explained by monotonic source growth.`);
  }
  return {
    odsMismatchDelta,
    odsMismatchRows,
    sourceGrowthRows,
    sourceGrowthRowsByTable,
    sourceRowsByTable,
  };
}

export function resolveQianchuanCardRatioCheckpointSourceProgress(checkpoint, plan) {
  const initialRowsByTable = initialQianchuanCardRatioSourceRows(plan);
  const initialOdsMismatchRows = asCount(plan.observed.odsMismatchRows, 'planned ODS mismatches');
  if (checkpoint?.schemaVersion !== 3) {
    const odsMismatchRows = asCount(
      checkpoint?.postcheck?.odsMismatchRows ?? initialOdsMismatchRows,
      'legacy checkpoint ODS mismatches',
    );
    if (odsMismatchRows !== initialOdsMismatchRows) {
      throw new Error('Legacy Stage 2 checkpoint contains untracked ODS mismatch drift.');
    }
    return {
      cumulativeOdsMismatchDelta: 0,
      cumulativeSourceGrowthRowsByTable: emptyCounts(),
      odsMismatchRows,
      sourceRowsByTable: initialRowsByTable,
    };
  }
  for (const table of QIANCHUAN_CARD_RATIO_STAGE2_TABLES) {
    if (checkpoint.sourceRowsByTable[table] - initialRowsByTable[table]
        !== checkpoint.cumulativeSourceGrowthRowsByTable[table]) {
      throw new Error(`Stage 2 checkpoint source growth is inconsistent for ${table}.`);
    }
  }
  if (checkpoint.odsMismatchRows - initialOdsMismatchRows
      !== checkpoint.cumulativeOdsMismatchDelta) {
    throw new Error('Stage 2 checkpoint cumulative ODS mismatch delta is inconsistent.');
  }
  return {
    cumulativeOdsMismatchDelta: checkpoint.cumulativeOdsMismatchDelta,
    cumulativeSourceGrowthRowsByTable: { ...checkpoint.cumulativeSourceGrowthRowsByTable },
    odsMismatchRows: checkpoint.odsMismatchRows,
    sourceRowsByTable: { ...checkpoint.sourceRowsByTable },
  };
}
