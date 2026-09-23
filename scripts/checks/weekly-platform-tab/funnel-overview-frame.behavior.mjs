#!/usr/bin/env node

/**
 * Weekly platform tab FunnelOverviewFrame behavior guard.
 *
 * The shared funnel frame should stay render-only. Leaf adapters own responsive
 * table prop construction; this frame only renders adapter-provided tableProps
 * beside the funnel chart.
 */

import path from 'node:path';
import {
  getInterfaceProperties,
  hasIdentifier,
  hasJsxAttribute,
  hasJsxElementWithAttribute,
  hasJsxElementWithSpread,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';
import { createWeeklyBehaviorGuard } from '../../lib/weekly/behavior-assert-utils.mjs';

const GUARD_NAME = 'weekly-platform-tab-funnel-overview-frame-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const framePath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-funnel-overview-frame.tsx',
  );
  const { sourceFile } = parseTsxFile(framePath);

  for (const identifierName of [
    'isMobile',
    'rows',
    'columns',
    'rowKey',
    'pagination',
    'mobileX',
    'desktopX',
    'desktopY',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`FunnelOverviewFrame must not own responsive table prop construction: ${identifierName}`);
    }
  }

  const propsContract = getInterfaceProperties(sourceFile, 'FunnelOverviewFrameProps');
  const propsSignature = propsContract
    ?.map((property) => `${property?.name}:${property?.type}`)
    .join('|');
  if (
    propsSignature !== [
      'badge:string',
      "funnelData:WeeklyFunnelChartProps['data']",
      'tableProps:Parameters<typeof WeeklyDataTable<RowType>>[0]',
      'children:ReactNode',
    ].join('|')
  ) {
    fail('FunnelOverviewFrame must keep its narrow adapter-built props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'WeeklyDataTable',
    spreadName: 'tableProps',
    typeArguments: ['RowType'],
  })) {
    fail('FunnelOverviewFrame must render adapter-provided tableProps');
  }

  if (!hasJsxElementWithAttribute(sourceFile, {
    tagName: 'WeeklyFunnelChart',
    attributeName: 'data',
    expressionText: 'funnelData',
  })) {
    fail('FunnelOverviewFrame must still render funnelData');
  }

  for (const propName of ['dataSource', 'columns', 'rowKey', 'size', 'pagination', 'scroll']) {
    if (hasJsxAttribute(sourceFile, propName)) {
      fail(`FunnelOverviewFrame must not construct table props inline: ${propName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
