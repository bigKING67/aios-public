#!/usr/bin/env node

/**
 * Weekly platform tab DouyinLiveSessionAttributionSection behavior guard.
 *
 * The live session section should stay render-only. Section adapters own
 * summary text, table props, waterfall props, and responsive table behavior.
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

const GUARD_NAME = 'weekly-platform-tab-douyin-live-session-section-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const sectionPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-live-session-section.tsx',
  );
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-douyin-live-leaf-adapter')) {
    fail('DouyinLiveSessionAttributionSection must not import its leaf adapter');
  }

  for (const identifierName of [
    'buildDouyinLiveSessionAttributionLeafProps',
    'ColumnsType',
    'DouyinSectionData',
    'DouyinLiveSessionRow',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinLiveSessionAttributionSection must stay render-only: ${identifierName}`);
    }
  }

  for (const rawInputName of [
    'isMobile',
    'data',
    'douyinLiveColumns',
    'waterfallTotalColor',
  ]) {
    if (
      hasIdentifier(sourceFile, rawInputName) ||
      hasFunctionObjectParameterBinding(sourceFile, 'DouyinLiveSessionAttributionSection', rawInputName) ||
      hasObjectLiteralProperty(sourceFile, rawInputName)
    ) {
      fail(`DouyinLiveSessionAttributionSection must not consume raw input: ${rawInputName}`);
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
      fail(`DouyinLiveSessionAttributionSection must not own table JSX props: ${attributeName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-live-leaf-contracts',
    importedName: 'DouyinLiveSessionAttributionSectionProps',
  })) {
    fail('DouyinLiveSessionAttributionSection must import its render-ready props contract');
  }

  if (
    getFunctionParameterType(sourceFile, 'DouyinLiveSessionAttributionSection') !==
    'DouyinLiveSessionAttributionSectionProps'
  ) {
    fail('DouyinLiveSessionAttributionSection must keep its imported render-ready props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinLiveSessionAttributionOverviewSection',
    spreadName: 'overviewSectionProps',
  })) {
    fail('DouyinLiveSessionAttributionSection must render adapter-provided overviewSectionProps');
  }

  if (!hasJsxElementWithExpressionChild(sourceFile, {
    tagName: 'WeeklyInlineSummary',
    expressionText: 'summaryText',
  })) {
    fail('DouyinLiveSessionAttributionSection must render adapter-provided summaryText');
  }

  for (const identifierName of [
    'buildDouyinLiveSessionAttributionLeafProps',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinLiveSessionAttributionSection must not own adapter behavior: ${identifierName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
