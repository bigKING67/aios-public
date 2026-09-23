#!/usr/bin/env node

/**
 * Weekly platform tab QuantAttributionSectionFrame behavior guard.
 *
 * Quant frame should stay render-only. Leaf adapters own responsive quant table
 * props; the frame only renders adapter-provided tableProps or empty state.
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

const GUARD_NAME = 'weekly-platform-tab-quant-attribution-frame-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const framePath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-quant-attribution-section-frame.tsx',
  );
  const { sourceFile } = parseTsxFile(framePath);

  for (const identifierName of [
    'isMobile',
    'rows',
    'columns',
    'rowKey',
    'resolveResponsiveTableSize',
    'resolveResponsiveTablePagination',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`QuantAttributionSectionFrame must not own responsive quant table props: ${identifierName}`);
    }
  }

  const propsContract = getInterfaceProperties(sourceFile, 'QuantAttributionSectionFrameProps');
  const propsSignature = propsContract
    ?.map((property) => `${property?.name}:${property?.type}`)
    .join('|');
  if (
    propsSignature !== [
      'title:string',
      'description:string',
      'tableProps:QuantTableProps',
      'emptyDescription:string',
    ].join('|')
  ) {
    fail('QuantAttributionSectionFrame must keep its narrow adapter-built props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'WeeklyDataTable',
    spreadName: 'tableProps',
  })) {
    fail('QuantAttributionSectionFrame must render adapter-provided tableProps');
  }

  if (!hasJsxElementWithAttribute(sourceFile, {
    tagName: 'WeeklyEmptyState',
    attributeName: 'description',
    expressionText: 'emptyDescription',
  })) {
    fail('QuantAttributionSectionFrame must keep empty state behavior');
  }

  for (const propName of ['dataSource', 'columns', 'rowKey', 'size', 'pagination', 'scroll', 'variant']) {
    if (hasJsxAttribute(sourceFile, propName)) {
      fail(`QuantAttributionSectionFrame must not construct quant table props inline: ${propName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
