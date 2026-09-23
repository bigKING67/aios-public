#!/usr/bin/env node

/**
 * Weekly platform tab TmallGoodsAttributionSection behavior guard.
 *
 * The goods section should stay render-only. Section adapters own summary text,
 * table props, waterfall props, and responsive table behavior.
 */

import path from 'node:path';
import {
  getFunctionParameterType,
  hasFunctionObjectParameterBinding,
  hasIdentifier,
  hasImportSource,
  hasJsxAttribute,
  hasJsxElementWithExpressionChild,
  hasJsxElementWithSpread,
  hasNamedImport,
  hasObjectLiteralProperty,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';
import { createWeeklyBehaviorGuard } from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-tmall-goods-section-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const sectionPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-tmall-goods-section.tsx',
  );
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-tmall-leaf-adapter')) {
    fail('TmallGoodsAttributionSection must not import its leaf adapter');
  }

  const bannedIdentifiers = [
    'buildTmallGoodsAttributionLeafProps',
    'ColumnsType',
    'WaterfallChart',
    'ComponentProps',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ];

  for (const identifierName of bannedIdentifiers) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`TmallGoodsAttributionSection must stay render-only: ${identifierName}`);
    }
  }

  const bannedRawInputs = [
    'isMobile',
    'goodsTableRows',
    'goodsColumns',
    'goodsWaterfallSteps',
    'attributionAsOfDate',
    'attributionTotalPrevGmv',
    'attributionTotalGmv',
    'attributionDelta',
    'waterfallTotalColor',
  ];

  for (const rawInputName of bannedRawInputs) {
    if (
      hasIdentifier(sourceFile, rawInputName) ||
      hasFunctionObjectParameterBinding(
        sourceFile,
        'TmallGoodsAttributionSection',
        rawInputName,
      ) ||
      hasObjectLiteralProperty(sourceFile, rawInputName) ||
      hasJsxAttribute(sourceFile, rawInputName)
    ) {
      fail(`TmallGoodsAttributionSection must not consume raw input: ${rawInputName}`);
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
      fail(`TmallGoodsAttributionSection must not own table JSX props: ${attributeName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-tmall-leaf-contracts',
    importedName: 'TmallGoodsAttributionSectionProps',
  })) {
    fail('TmallGoodsAttributionSection must import its render-ready props contract');
  }

  if (
    getFunctionParameterType(sourceFile, 'TmallGoodsAttributionSection') !==
    'TmallGoodsAttributionSectionProps'
  ) {
    fail('TmallGoodsAttributionSection must keep its imported render-ready props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'TmallGoodsAttributionOverviewSection',
    spreadName: 'overviewSectionProps',
  })) {
    fail('TmallGoodsAttributionSection must render adapter-provided overviewSectionProps');
  }

  if (!hasJsxElementWithExpressionChild(sourceFile, {
    tagName: 'WeeklyInlineSummary',
    expressionText: 'summaryText',
  })) {
    fail('TmallGoodsAttributionSection must render adapter-provided summaryText');
  }

  for (const identifierName of [
    'buildTmallGoodsAttributionLeafProps',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`TmallGoodsAttributionSection must not own adapter behavior: ${identifierName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
