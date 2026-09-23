#!/usr/bin/env node

/**
 * Weekly platform tab DouyinCardSourceFunnelSection behavior guard.
 *
 * The card source funnel section should stay render-only. Section adapters own
 * source-title resolution, funnel props, quant table props, and responsive
 * behavior.
 */

import path from 'node:path';
import {
  getFunctionParameterType,
  hasFunctionObjectParameterBinding,
  hasIdentifier,
  hasImportSource,
  hasJsxAttribute,
  hasJsxElementWithAttribute,
  hasJsxElementWithSpread,
  hasNamedImport,
  hasObjectLiteralProperty,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';
import { createWeeklyBehaviorGuard } from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-card-source-funnel-section-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const sectionPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-card-source-funnel-section.tsx',
  );
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-douyin-card-leaf-adapter')) {
    fail('DouyinCardSourceFunnelSection must not import its leaf adapter');
  }

  for (const identifierName of [
    'buildDouyinCardSourceFunnelLeafProps',
    'ColumnsType',
    'DouyinSectionData',
    'DouyinMetricDetailRow',
    'QuantAttributionRow',
    'selectedDouyinCardSource',
    'sourceLevel1',
    'buildFunnelTableProps',
    'buildQuantTableProps',
    'buildDouyinFunnelChartData',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinCardSourceFunnelSection must stay render-only: ${identifierName}`);
    }
  }

  for (const rawInputName of [
    'isMobile',
    'data',
    'douyinLiveDetailColumns',
    'quantColumns',
    'resolveFunnelStageColor',
  ]) {
    if (
      hasIdentifier(sourceFile, rawInputName) ||
      hasFunctionObjectParameterBinding(sourceFile, 'DouyinCardSourceFunnelSection', rawInputName) ||
      hasObjectLiteralProperty(sourceFile, rawInputName)
    ) {
      fail(`DouyinCardSourceFunnelSection must not consume raw input: ${rawInputName}`);
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
      fail(`DouyinCardSourceFunnelSection must not own table JSX props: ${attributeName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-card-leaf-contracts',
    importedName: 'DouyinCardSourceFunnelSectionProps',
  })) {
    fail('DouyinCardSourceFunnelSection must import its render-ready props contract');
  }

  if (
    getFunctionParameterType(sourceFile, 'DouyinCardSourceFunnelSection') !==
    'DouyinCardSourceFunnelSectionProps'
  ) {
    fail('DouyinCardSourceFunnelSection must keep its imported render-ready props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinCardSourceFunnelOverviewSection',
    spreadName: 'overviewSectionProps',
  })) {
    fail('DouyinCardSourceFunnelSection must render adapter-provided overviewSectionProps');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinCardSourceQuantSection',
    spreadName: 'quantSectionProps',
  })) {
    fail('DouyinCardSourceFunnelSection must render adapter-provided quantSectionProps');
  }

  if (!hasJsxElementWithAttribute(sourceFile, {
    tagName: 'WeeklyEmptyState',
    attributeName: 'description',
    expressionText: '暂无可分析来源渠道',
  })) {
    fail('DouyinCardSourceFunnelSection must keep empty state behavior');
  }

  for (const identifierName of [
    'buildDouyinCardSourceFunnelLeafProps',
    'buildFunnelTableProps',
    'buildQuantTableProps',
    'buildDouyinFunnelChartData',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinCardSourceFunnelSection must not own adapter behavior: ${identifierName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
