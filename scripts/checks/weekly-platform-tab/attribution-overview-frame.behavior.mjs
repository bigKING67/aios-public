#!/usr/bin/env node

/**
 * Weekly platform tab AttributionOverviewFrame behavior guard.
 *
 * The shared frame should stay render-only for attribution tables and
 * waterfall charts. Leaf adapters own responsive table props and WaterfallChart
 * prop construction; this frame only renders the provided props or empty states.
 */

import path from 'node:path';
import {
  getInterfaceProperties,
  hasIdentifier,
  hasJsxAttribute,
  hasJsxElementWithAttribute,
  hasJsxElementWithSpread,
  hasLocalTypeDeclaration,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';
import { createWeeklyBehaviorGuard } from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-attribution-overview-frame-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const framePath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-attribution-overview-frame.tsx',
  );
  const { sourceFile } = parseTsxFile(framePath);

  if (hasLocalTypeDeclaration(sourceFile, 'AttributionWaterfallSteps')) {
    fail('AttributionOverviewFrame must not define waterfall step input contracts');
  }

  for (const identifierName of [
    'waterfallSteps',
    'previousValue',
    'currentValue',
    'waterfallTotalColor',
    'waterfallTitle',
    'isMobile',
    'rows',
    'columns',
    'rowKey',
    'mobileX',
    'desktopX',
    'resolveResponsiveTableSize',
    'resolveResponsiveTablePagination',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`AttributionOverviewFrame must not own table/chart prop construction: ${identifierName}`);
    }
  }

  const propsContract = getInterfaceProperties(sourceFile, 'AttributionOverviewFrameProps');
  const propsSignature = propsContract
    ?.map((property) => `${property?.name}:${property?.type}`)
    .join('|');
  if (
    propsSignature !== [
      'tableProps:AttributionTableProps<RowType>',
      'waterfallChartProps:AttributionWaterfallChartProps',
      'tableEmptyDescription:string',
      'waterfallEmptyDescription:string',
    ].join('|')
  ) {
    fail('AttributionOverviewFrame must keep its narrow adapter-built props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'WeeklyDataTable',
    spreadName: 'tableProps',
    typeArguments: ['RowType'],
  })) {
    fail('AttributionOverviewFrame must render adapter-provided tableProps');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'WaterfallChart',
    spreadName: 'waterfallChartProps',
  })) {
    fail('AttributionOverviewFrame must render adapter-provided waterfallChartProps');
  }

  for (const propName of ['dataSource', 'columns', 'rowKey', 'size', 'pagination', 'scroll']) {
    if (hasJsxAttribute(sourceFile, propName)) {
      fail(`AttributionOverviewFrame must not construct table props inline: ${propName}`);
    }
  }

  for (const propName of ['steps', 'startValue', 'endValue', 'totalColor']) {
    if (hasJsxElementWithSpread(sourceFile, {
      tagName: 'WaterfallChart',
      spreadName: propName,
    })) {
      fail(`AttributionOverviewFrame must not construct chart props inline: ${propName}`);
    }
  }

  for (const { attributeName, expressionText } of [
    { attributeName: 'steps', expressionText: 'waterfallSteps' },
    { attributeName: 'startValue', expressionText: 'previousValue' },
    { attributeName: 'endValue', expressionText: 'currentValue' },
    { attributeName: 'totalColor', expressionText: 'waterfallTotalColor' },
    { attributeName: 'height', expressionText: '360' },
    { attributeName: 'gridBottomPx', expressionText: '26' },
    { attributeName: 'showBoundaryTotals', expressionText: 'false' },
  ]) {
    if (hasJsxElementWithAttribute(sourceFile, {
      tagName: 'WaterfallChart',
      attributeName,
      expressionText,
    })) {
      fail(`AttributionOverviewFrame must not construct chart props inline: ${attributeName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
