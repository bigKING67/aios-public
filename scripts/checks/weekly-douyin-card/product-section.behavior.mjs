#!/usr/bin/env node

/**
 * Weekly platform tab DouyinCardProductAttributionSection behavior guard.
 *
 * The card product section should stay render-only. Section adapters own
 * summary text, table props, waterfall props, and responsive table behavior.
 */

import path from 'node:path';
import {
  getFunctionParameterType,
  hasFunctionObjectParameterBinding,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithExpressionChild,
  hasJsxElementWithSpread,
  hasJsxAttribute,
  hasNamedImport,
  hasObjectLiteralProperty,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';
import { createWeeklyBehaviorGuard } from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-card-product-section-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const sectionPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-card-product-section.tsx',
  );
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-douyin-card-leaf-adapter')) {
    fail('DouyinCardProductAttributionSection must not import its leaf adapter');
  }

  const bannedIdentifiers = [
    'buildDouyinCardProductAttributionLeafProps',
    'ColumnsType',
    'DouyinSectionData',
    'DouyinCardProductRow',
    'buildAttributionTableProps',
    'buildAttributionWaterfallChartProps',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ];

  for (const identifierName of bannedIdentifiers) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinCardProductAttributionSection must stay render-only: ${identifierName}`);
    }
  }

  for (const rawInputName of [
    'isMobile',
    'data',
    'douyinCardProductColumns',
    'waterfallTotalColor',
  ]) {
    if (
      hasIdentifier(sourceFile, rawInputName) ||
      hasFunctionObjectParameterBinding(
        sourceFile,
        'DouyinCardProductAttributionSection',
        rawInputName,
      ) ||
      hasObjectLiteralProperty(sourceFile, rawInputName)
    ) {
      fail(`DouyinCardProductAttributionSection must not consume raw input: ${rawInputName}`);
    }
  }

  for (const attributeName of [
    'rowKey',
    'dataSource',
    'columns',
    'pagination',
    'scroll',
  ]) {
    if (hasJsxAttribute(sourceFile, attributeName)) {
      fail(`DouyinCardProductAttributionSection must not own table JSX props: ${attributeName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-card-leaf-contracts',
    importedName: 'DouyinCardProductAttributionSectionProps',
  })) {
    fail('DouyinCardProductAttributionSection must import its render-ready props contract');
  }

  if (
    getFunctionParameterType(sourceFile, 'DouyinCardProductAttributionSection') !==
    'DouyinCardProductAttributionSectionProps'
  ) {
    fail('DouyinCardProductAttributionSection must keep its imported render-ready props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinCardProductAttributionOverviewSection',
    spreadName: 'overviewSectionProps',
  })) {
    fail('DouyinCardProductAttributionSection must render adapter-provided overviewSectionProps');
  }

  if (!hasJsxElementWithExpressionChild(sourceFile, {
    tagName: 'WeeklyInlineSummary',
    expressionText: 'summaryText',
  })) {
    fail('DouyinCardProductAttributionSection must render adapter-provided summaryText');
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
