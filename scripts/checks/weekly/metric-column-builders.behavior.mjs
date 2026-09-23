#!/usr/bin/env node

/**
 * Weekly metric column builder behavior guard.
 *
 * These helpers are the shared path for attribution/funnel table metric
 * columns. Keep their title/key/dataIndex/render semantics explicit so table
 * column refactors do not silently change formatting or empty-value handling.
 */

import {
  createWeeklyBehaviorGuard,
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-metric-column-builders-behavior';
const {
  assertEqual,
  reportError,
  reportOk,
} = createWeeklyBehaviorGuard(GUARD_NAME);

async function loadMetricColumnBuilders() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-metric-columns-',
    entrySource: createWeeklyTabsEntrySource(repoRoot, 'platform-tab-metric-column-builders', [
      'createCurrencyFixedMetricColumn',
      'createFormattedMetricColumn',
      'createIntegerMetricColumn',
      'createRatioPercentMetricColumn',
      'createSignedCurrencyMetricColumn',
      'createSignedPercentMetricColumn',
    ]),
  });
}

function renderColumn(column, record, overrideValue) {
  const value = overrideValue === undefined ? record[column.dataIndex] : overrideValue;
  return column.render(value, record, 0);
}

function assertBaseColumnContract(createFormattedMetricColumn) {
  const column = createFormattedMetricColumn(
    '本周值',
    'current',
    128,
    (value, record) => `${record.prefix}:${value}`,
  );
  const record = {
    prefix: 'gmv',
    current: 42,
  };

  assertEqual(column.title, '本周值', 'formatted column should keep the provided title');
  assertEqual(column.dataIndex, 'current', 'formatted column should keep the provided dataIndex');
  assertEqual(column.key, 'current', 'formatted column key should default to dataIndex');
  assertEqual(column.width, 128, 'formatted column should keep the provided width');
  assertEqual(renderColumn(column, record), 'gmv:42', 'formatted column should pass value and record to formatter');
}

function assertTypedFormatterColumns(builders) {
  const {
    createCurrencyFixedMetricColumn,
    createIntegerMetricColumn,
    createRatioPercentMetricColumn,
    createSignedCurrencyMetricColumn,
    createSignedPercentMetricColumn,
  } = builders;
  const record = {
    count: 1234.4,
    amount: 1234.5,
    rate: 0.1234,
    deltaAmount: 25.5,
    deltaRate: -12.345,
  };

  assertEqual(
    renderColumn(createIntegerMetricColumn('人数', 'count', 100), record),
    '1,234',
    'integer metric column should use zh-CN rounded integer formatting',
  );
  assertEqual(
    renderColumn(createCurrencyFixedMetricColumn('金额', 'amount', 120, 1), record),
    '¥1,234.5',
    'currency fixed metric column should honor custom digits',
  );
  assertEqual(
    renderColumn(createRatioPercentMetricColumn('转化率', 'rate', 120, 1), record),
    '12.3%',
    'ratio percent metric column should convert ratio to percent and honor digits',
  );
  assertEqual(
    renderColumn(createSignedCurrencyMetricColumn('贡献', 'deltaAmount', 120), record),
    '+¥26',
    'signed currency metric column should show positive sign',
  );
  assertEqual(
    renderColumn(createSignedPercentMetricColumn('变化率', 'deltaRate', 120, 2), record),
    '-12.35%',
    'signed percent metric column should honor custom digits',
  );
}

function assertEmptyValueBehavior(builders) {
  const {
    createCurrencyFixedMetricColumn,
    createIntegerMetricColumn,
    createRatioPercentMetricColumn,
    createSignedCurrencyMetricColumn,
    createSignedPercentMetricColumn,
  } = builders;
  const record = {};

  assertEqual(
    renderColumn(createIntegerMetricColumn('人数', 'count', 100), record),
    '--',
    'integer metric column should render missing values as --',
  );
  assertEqual(
    renderColumn(createCurrencyFixedMetricColumn('金额', 'amount', 120), record),
    '--',
    'currency fixed metric column should render missing values as --',
  );
  assertEqual(
    renderColumn(createRatioPercentMetricColumn('转化率', 'rate', 120), record),
    '--',
    'ratio percent metric column should render missing values as --',
  );
  assertEqual(
    renderColumn(createSignedCurrencyMetricColumn('贡献', 'deltaAmount', 120), record),
    '--',
    'signed currency metric column should render missing values as --',
  );
  assertEqual(
    renderColumn(createSignedPercentMetricColumn('变化率', 'deltaRate', 120), record),
    '--',
    'signed percent metric column should render missing values as --',
  );
}

async function main() {
  const builders = await loadMetricColumnBuilders();

  assertBaseColumnContract(builders.createFormattedMetricColumn);
  assertTypedFormatterColumns(builders);
  assertEmptyValueBehavior(builders);

  reportOk();
}

main().catch((error) => {
  reportError(error, 'unexpected runtime error');
});
