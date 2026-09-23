#!/usr/bin/env node

/**
 * Weekly platform tab DouyinLiveFunnelAttributionSection behavior guard.
 *
 * The live funnel section should stay render-only. Section adapters own anchor
 * title resolution, funnel props, quant table props, and responsive behavior.
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

const GUARD_NAME = 'weekly-platform-tab-douyin-live-funnel-section-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const sectionPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-live-funnel-section.tsx',
  );
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-douyin-live-leaf-adapter')) {
    fail('DouyinLiveFunnelAttributionSection must not import its leaf adapter');
  }

  for (const identifierName of [
    'buildDouyinLiveFunnelAttributionLeafProps',
    'ColumnsType',
    'DouyinSectionData',
    'DouyinMetricDetailRow',
    'QuantAttributionRow',
    'selectedDouyinLiveRow',
    'anchorNickname',
    'buildFunnelTableProps',
    'buildQuantTableProps',
    'buildDouyinFunnelChartData',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinLiveFunnelAttributionSection must stay render-only: ${identifierName}`);
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
      hasFunctionObjectParameterBinding(sourceFile, 'DouyinLiveFunnelAttributionSection', rawInputName) ||
      hasObjectLiteralProperty(sourceFile, rawInputName)
    ) {
      fail(`DouyinLiveFunnelAttributionSection must not consume raw input: ${rawInputName}`);
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
      fail(`DouyinLiveFunnelAttributionSection must not own table JSX props: ${attributeName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-live-leaf-contracts',
    importedName: 'DouyinLiveFunnelAttributionSectionProps',
  })) {
    fail('DouyinLiveFunnelAttributionSection must import its render-ready props contract');
  }

  if (
    getFunctionParameterType(sourceFile, 'DouyinLiveFunnelAttributionSection') !==
    'DouyinLiveFunnelAttributionSectionProps'
  ) {
    fail('DouyinLiveFunnelAttributionSection must keep its imported render-ready props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinLiveFunnelOverviewSection',
    spreadName: 'overviewSectionProps',
  })) {
    fail('DouyinLiveFunnelAttributionSection must render adapter-provided overviewSectionProps');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinLiveQuantSection',
    spreadName: 'quantSectionProps',
  })) {
    fail('DouyinLiveFunnelAttributionSection must render adapter-provided quantSectionProps');
  }

  if (!hasJsxElementWithAttribute(sourceFile, {
    tagName: 'WeeklyEmptyState',
    attributeName: 'description',
    expressionText: '暂无可分析直播场次',
  })) {
    fail('DouyinLiveFunnelAttributionSection must keep empty state behavior');
  }

  for (const identifierName of [
    'buildDouyinLiveFunnelAttributionLeafProps',
    'buildFunnelTableProps',
    'buildQuantTableProps',
    'buildDouyinFunnelChartData',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinLiveFunnelAttributionSection must not own adapter behavior: ${identifierName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
