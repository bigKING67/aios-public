#!/usr/bin/env node

/**
 * Weekly platform tab TmallChannelAttributionSection behavior guard.
 *
 * The channel section should stay render-only. Section adapters own summary
 * text, table props, waterfall props, and responsive table behavior.
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

const GUARD_NAME = 'weekly-platform-tab-tmall-channel-section-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const sectionPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-tmall-channel-section.tsx',
  );
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-tmall-leaf-adapter')) {
    fail('TmallChannelAttributionSection must not import its leaf adapter');
  }

  const bannedIdentifiers = [
    'buildTmallChannelAttributionLeafProps',
    'ColumnsType',
    'WaterfallChart',
    'ComponentProps',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ];

  for (const identifierName of bannedIdentifiers) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`TmallChannelAttributionSection must stay render-only: ${identifierName}`);
    }
  }

  const bannedRawInputs = [
    'isMobile',
    'channelTableRows',
    'channelColumns',
    'channelWaterfallSteps',
    'channelAttributionAsOfDate',
    'channelAttributionTotalPrevPayAmount',
    'channelAttributionTotalPayAmount',
    'channelAttributionDelta',
    'waterfallTotalColor',
  ];

  for (const rawInputName of bannedRawInputs) {
    if (
      hasIdentifier(sourceFile, rawInputName) ||
      hasFunctionObjectParameterBinding(
        sourceFile,
        'TmallChannelAttributionSection',
        rawInputName,
      ) ||
      hasObjectLiteralProperty(sourceFile, rawInputName) ||
      hasJsxAttribute(sourceFile, rawInputName)
    ) {
      fail(`TmallChannelAttributionSection must not consume raw input: ${rawInputName}`);
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
      fail(`TmallChannelAttributionSection must not own table JSX props: ${attributeName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-tmall-leaf-contracts',
    importedName: 'TmallChannelAttributionSectionProps',
  })) {
    fail('TmallChannelAttributionSection must import its render-ready props contract');
  }

  if (
    getFunctionParameterType(sourceFile, 'TmallChannelAttributionSection') !==
    'TmallChannelAttributionSectionProps'
  ) {
    fail('TmallChannelAttributionSection must keep its imported render-ready props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'TmallChannelAttributionOverviewSection',
    spreadName: 'overviewSectionProps',
  })) {
    fail('TmallChannelAttributionSection must render adapter-provided overviewSectionProps');
  }

  if (!hasJsxElementWithExpressionChild(sourceFile, {
    tagName: 'WeeklyInlineSummary',
    expressionText: 'summaryText',
  })) {
    fail('TmallChannelAttributionSection must render adapter-provided summaryText');
  }

  for (const identifierName of [
    'buildTmallChannelAttributionLeafProps',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`TmallChannelAttributionSection must not own adapter behavior: ${identifierName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
