#!/usr/bin/env node

/**
 * Weekly platform tab DouyinShortvideoAnalysisSection behavior guard.
 *
 * The analysis section should stay render-only. Section adapters own selected
 * author resolution, diagnosis mapping, and responsive table props.
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

const GUARD_NAME = 'weekly-platform-tab-douyin-shortvideo-analysis-section-behavior';

const { fail, reportError, reportOk } = createWeeklyBehaviorGuard(GUARD_NAME);

function main() {
  const repoRoot = process.cwd();
  const sectionPath = path.join(
    repoRoot,
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-shortvideo-analysis-section.tsx',
  );
  const { sourceFile } = parseTsxFile(sectionPath);

  if (hasImportSource(sourceFile, 'platform-tab-douyin-shortvideo-leaf-adapter')) {
    fail('DouyinShortvideoAnalysisSection must not import its leaf adapter');
  }

  for (const identifierName of [
    'buildDouyinShortvideoAnalysisLeafProps',
    'DouyinSectionData',
    'ColumnsType',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinShortvideoAnalysisSection must stay render-only: ${identifierName}`);
    }
  }

  for (const rawInputName of [
    'isMobile',
    'data',
    'douyinShortvideoColumns',
  ]) {
    if (
      hasIdentifier(sourceFile, rawInputName) ||
      hasFunctionObjectParameterBinding(sourceFile, 'DouyinShortvideoAnalysisSection', rawInputName) ||
      hasObjectLiteralProperty(sourceFile, rawInputName)
    ) {
      fail(`DouyinShortvideoAnalysisSection must not consume raw input: ${rawInputName}`);
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
      fail(`DouyinShortvideoAnalysisSection must not own table JSX props: ${attributeName}`);
    }
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-shortvideo-leaf-contracts',
    importedName: 'DouyinShortvideoAnalysisSectionProps',
  })) {
    fail('DouyinShortvideoAnalysisSection must import its render-ready props contract');
  }

  if (
    getFunctionParameterType(sourceFile, 'DouyinShortvideoAnalysisSection') !==
    'DouyinShortvideoAnalysisSectionProps'
  ) {
    fail('DouyinShortvideoAnalysisSection must keep its imported render-ready props contract');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'WeeklyDiagnosisCard',
    spreadName: 'diagnosisCardProps',
  })) {
    fail('DouyinShortvideoAnalysisSection must render adapter-provided diagnosisCardProps');
  }

  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'WeeklyDataTable',
    spreadName: 'tableProps',
    typeArguments: ['DouyinShortvideoRow'],
  })) {
    fail('DouyinShortvideoAnalysisSection must render adapter-provided tableProps');
  }

  if (!hasJsxElementWithAttribute(sourceFile, {
    tagName: 'WeeklyEmptyState',
    attributeName: 'description',
    expressionText: '暂无可分析短视频内容',
  })) {
    fail('DouyinShortvideoAnalysisSection must keep empty state behavior');
  }

  for (const identifierName of [
    'buildDouyinShortvideoAnalysisLeafProps',
    'resolveResponsiveTableSize',
    'resolveResponsiveTableScroll',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinShortvideoAnalysisSection must not own adapter behavior: ${identifierName}`);
    }
  }

  reportOk();
}

try {
  main();
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
