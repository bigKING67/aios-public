#!/usr/bin/env node

/**
 * Weekly platform tab DouyinCardSourceAttributionSection behavior guard.
 *
 * The card source section should stay render-only. Section adapters own source
 * description, summary text, table props, waterfall props, and responsive
 * table behavior.
 */

import path from 'node:path';
import {
  getFunctionParameterType,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithAttribute,
  hasJsxElementWithExpressionChild,
  hasJsxElementWithSpread,
  hasNamedImport,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';
import { createWeeklyBehaviorGuard } from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-card-source-section-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const sectionPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-card-source-section.tsx',
  );
  const { sourceFile } = parseTsxFile(sectionPath);

  for (const identifierName of [
    'buildDouyinCardSourceAttributionLeafProps',
    'ColumnsType',
    'DouyinSectionData',
    'DouyinCardSourceRow',
    'diagnosisCardProductId',
    'diagnosisCardProductName',
    'buildAttributionTableProps',
    'buildAttributionWaterfallChartProps',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
    'isMobile',
    'data',
    'douyinCardSourceColumns',
    'waterfallTotalColor',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinCardSourceAttributionSection must stay render-only: ${identifierName}`);
    }
  }

  if (hasImportSource(sourceFile, 'platform-tab-douyin-card-leaf-adapter')) {
    fail('DouyinCardSourceAttributionSection must not import its adapter');
  }
  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-card-leaf-contracts',
    importedName: 'DouyinCardSourceAttributionSectionProps',
  })) {
    fail('DouyinCardSourceAttributionSection missing render-ready props contract import');
  }
  if (
    getFunctionParameterType(sourceFile, 'DouyinCardSourceAttributionSection') !==
    'DouyinCardSourceAttributionSectionProps'
  ) {
    fail('DouyinCardSourceAttributionSection must keep its imported render-ready props contract');
  }

  for (const { tagName, attributeName } of [
    { tagName: 'DouyinCardSourceAttributionOverviewSection', attributeName: 'rowKey' },
    { tagName: 'DouyinCardSourceAttributionOverviewSection', attributeName: 'dataSource' },
    { tagName: 'DouyinCardSourceAttributionOverviewSection', attributeName: 'columns' },
    { tagName: 'DouyinCardSourceAttributionOverviewSection', attributeName: 'pagination' },
    { tagName: 'DouyinCardSourceAttributionOverviewSection', attributeName: 'scroll' },
  ]) {
    if (hasJsxElementWithAttribute(sourceFile, { tagName, attributeName })) {
      fail(`DouyinCardSourceAttributionSection must not own ${tagName} ${attributeName}`);
    }
  }

  if (!hasJsxElementWithAttribute(sourceFile, {
    tagName: 'WeeklySectionHeader',
    attributeName: 'description',
    expressionText: 'sourceDescription',
  })) {
    fail('DouyinCardSourceAttributionSection must render adapter-provided sourceDescription');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinCardSourceAttributionOverviewSection',
    spreadName: 'overviewSectionProps',
  })) {
    fail('DouyinCardSourceAttributionSection must render adapter-provided overviewSectionProps');
  }

  if (!hasJsxElementWithExpressionChild(sourceFile, {
    tagName: 'WeeklyInlineSummary',
    expressionText: 'summaryText',
  })) {
    fail('DouyinCardSourceAttributionSection must render adapter-provided summaryText');
  }

  for (const identifierName of [
    'buildDouyinCardSourceAttributionLeafProps',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinCardSourceAttributionSection must not own adapter behavior: ${identifierName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
