#!/usr/bin/env node

/**
 * Weekly platform tab DouyinShortvideoOverviewSection behavior guard.
 *
 * The overview section should stay render-only. Section adapters own summary
 * text, table props, and waterfall props construction.
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

const GUARD_NAME = 'weekly-platform-tab-douyin-shortvideo-overview-section-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const sectionPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-shortvideo-overview-section.tsx',
  );
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-douyin-shortvideo-leaf-adapter')) {
    fail('DouyinShortvideoOverviewSection must not import its leaf adapter');
  }

  for (const identifierName of [
    'buildDouyinShortvideoOverviewLeafProps',
    'DouyinSectionData',
    'ColumnsType',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinShortvideoOverviewSection must stay render-only: ${identifierName}`);
    }
  }

  for (const rawInputName of [
    'isMobile',
    'data',
    'douyinShortvideoColumns',
    'waterfallTotalColor',
  ]) {
    if (
      hasIdentifier(sourceFile, rawInputName) ||
      hasFunctionObjectParameterBinding(sourceFile, 'DouyinShortvideoOverviewSection', rawInputName) ||
      hasObjectLiteralProperty(sourceFile, rawInputName)
    ) {
      fail(`DouyinShortvideoOverviewSection must not consume raw input: ${rawInputName}`);
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
      fail(`DouyinShortvideoOverviewSection must not own table JSX props: ${attributeName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-shortvideo-leaf-contracts',
    importedName: 'DouyinShortvideoOverviewSectionProps',
  })) {
    fail('DouyinShortvideoOverviewSection must import its render-ready props contract');
  }

  if (
    getFunctionParameterType(sourceFile, 'DouyinShortvideoOverviewSection') !==
    'DouyinShortvideoOverviewSectionProps'
  ) {
    fail('DouyinShortvideoOverviewSection must keep its imported render-ready props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinShortvideoAttributionOverviewSection',
    spreadName: 'overviewSectionProps',
  })) {
    fail('DouyinShortvideoOverviewSection must render adapter-provided overviewSectionProps');
  }

  if (!hasJsxElementWithExpressionChild(sourceFile, {
    tagName: 'WeeklyInlineSummary',
    expressionText: 'summaryText',
  })) {
    fail('DouyinShortvideoOverviewSection must render adapter-provided summaryText');
  }

  for (const identifierName of [
    'buildDouyinShortvideoOverviewLeafProps',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinShortvideoOverviewSection must not own adapter behavior: ${identifierName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
