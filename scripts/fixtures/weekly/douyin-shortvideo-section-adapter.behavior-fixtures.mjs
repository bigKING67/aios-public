/**
 * Weekly platform tab Douyin shortvideo-section adapter behavior fixtures.
 *
 * DouyinShortvideoAttributionSections should stay render-only. The adapter
 * owns the mapping from the shortvideo attribution input contract into the two
 * narrow child section contracts: overview and analysis.
 */

import {
  createWeeklyTabsEntrySource,
  importBundledWeeklyBehaviorEntry,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import path from 'node:path';
import {
  countCallExpressions,
  getFunctionParameterType,
  hasIdentifier,
  hasImportSource,
  hasJsxElementWithSpread,
  hasNamedImport,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Douyin shortvideo section adapter behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertKeys(...args) {
  currentAssertions().assertKeys(...args);
}

function assertSame(...args) {
  currentAssertions().assertSame(...args);
}

function fail(...args) {
  currentAssertions().fail(...args);
}

async function loadDouyinShortvideoSectionAdapter() {
  const repoRoot = process.cwd();
  return importBundledWeeklyBehaviorEntry({
    repoRoot,
    tempPrefix: 'aios-weekly-douyin-shortvideo-section-adapter-',
    entrySource: createWeeklyTabsEntrySource(
      repoRoot,
      'platform-tab-douyin-shortvideo-section-adapter',
      ['buildDouyinShortvideoAttributionSectionProps'],
    ),
  });
}

function makeShortvideoSectionProps() {
  const data = {
    douyinShortvideoAsOfDate: '2026-05-04',
    selectedDouyinShortvideoRow: { rowId: 'SV001', authorNickname: '作者A' },
    selectedDouyinShortvideoDiagnosis: [{ reason: '曝光提升', action: '复用素材结构' }],
    douyinShortvideoTableRows: [{ rowId: 'SV001' }],
    douyinShortvideoTotalCurrent: 128800,
    douyinShortvideoTotalPrev: 100000,
    douyinShortvideoTotalDelta: 28800,
    douyinShortvideoWaterfallSteps: [{ label: '短视频A', value: 80 }],
  };

  return {
    isMobile: true,
    data,
    douyinShortvideoColumns: [{ key: 'shortvideo' }],
    waterfallTotalColor: '#445df6',
    report: { marker: 'should-not-pass' },
    columns: { marker: 'should-not-pass' },
    viewModel: { marker: 'should-not-pass' },
  };
}

function assertOverviewSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    ['overviewSectionProps', 'summaryText'],
    'shortvideo overview adapter should return render-ready overview props',
  );
  assertKeys(
    sectionProps.overviewSectionProps,
    ['tableProps', 'waterfallChartProps'],
    'shortvideo overview child props should stay narrow',
  );
  assertKeys(
    sectionProps.overviewSectionProps.tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'shortvideo overview table props should stay narrow',
  );
  assertSame(
    sectionProps.overviewSectionProps.tableProps.dataSource,
    sourceProps.data.douyinShortvideoTableRows,
    'overview table should preserve table rows',
  );
  assertSame(
    sectionProps.overviewSectionProps.tableProps.columns,
    sourceProps.douyinShortvideoColumns,
    'overview table should preserve shortvideo columns reference',
  );
  assertEqual(sectionProps.overviewSectionProps.tableProps.size, 'small', 'overview mobile table should use compact size');
  assertEqual(sectionProps.overviewSectionProps.tableProps.pagination.pageSize, 8, 'overview mobile table should use page size 8');
  assertEqual(sectionProps.overviewSectionProps.tableProps.scroll.x, 980, 'overview mobile table should use mobile x');
  assertEqual(
    sectionProps.overviewSectionProps.tableProps.rowKey(sourceProps.data.douyinShortvideoTableRows[0]),
    'SV001',
    'overview table rowKey should use row id',
  );
  assertKeys(
    sectionProps.overviewSectionProps.waterfallChartProps,
    [
      'endLabel',
      'endValue',
      'gridBottomPx',
      'height',
      'showBoundaryTotals',
      'startLabel',
      'startValue',
      'steps',
      'title',
      'totalColor',
    ],
    'shortvideo overview waterfall props should stay narrow',
  );
  assertEqual(
    sectionProps.overviewSectionProps.waterfallChartProps.totalColor,
    sourceProps.waterfallTotalColor,
    'overview waterfall should preserve waterfall total color',
  );
  assertEqual(
    sectionProps.summaryText,
    '同期口径截止：2026/05/04 ｜ 上周同期：¥10.00万 ｜ 本周同期：¥12.88万 ｜ 总增量：+¥2.88万',
    'overview section should build summary text once',
  );
}

function assertAnalysisSectionProps(sectionProps, sourceProps) {
  assertKeys(
    sectionProps,
    ['diagnosisCardProps', 'selectedAuthorNickname', 'tableProps'],
    'shortvideo analysis adapter should return render-ready analysis props',
  );
  assertEqual(
    sectionProps.selectedAuthorNickname,
    sourceProps.data.selectedDouyinShortvideoRow.authorNickname,
    'analysis section should resolve author nickname',
  );
  assertKeys(
    sectionProps.diagnosisCardProps,
    ['items', 'title'],
    'analysis section should receive render-ready diagnosis card props',
  );
  assertEqual(sectionProps.diagnosisCardProps.title, '原因与动作建议', 'analysis diagnosis title should be stable');
  assertEqual(sectionProps.diagnosisCardProps.items.length, 1, 'analysis diagnosis should map diagnosis items');
  assertEqual(
    sectionProps.diagnosisCardProps.items[0].key,
    'SV001-diagnosis-0',
    'analysis diagnosis item key should use selected row id',
  );
  assertKeys(
    sectionProps.tableProps,
    ['columns', 'dataSource', 'pagination', 'rowKey', 'scroll', 'size'],
    'shortvideo analysis table props should stay narrow',
  );
  assertSame(sectionProps.tableProps.dataSource[0], sourceProps.data.selectedDouyinShortvideoRow, 'analysis table should preserve selected row reference');
  assertSame(
    sectionProps.tableProps.columns,
    sourceProps.douyinShortvideoColumns,
    'analysis table should preserve shortvideo columns reference',
  );
  assertEqual(sectionProps.tableProps.size, 'small', 'analysis mobile table should use compact size');
  assertEqual(sectionProps.tableProps.pagination, false, 'analysis table should disable pagination');
  assertEqual(sectionProps.tableProps.scroll.x, 980, 'analysis mobile table should use mobile x');
  assertEqual(
    sectionProps.tableProps.rowKey(sourceProps.data.selectedDouyinShortvideoRow),
    'SV001',
    'analysis table rowKey should use row id',
  );
}

function assertNoCrossLeaks(sectionProps) {
  assertEqual('report' in sectionProps, false, 'section props should not pass report context');
  assertEqual('columns' in sectionProps, false, 'section props should not pass full column bundle');
  assertEqual('viewModel' in sectionProps, false, 'section props should not pass view model');
  assertEqual(
    'waterfallTotalColor' in sectionProps && Object.keys(sectionProps).length === 3,
    false,
    'analysis props should not receive overview-only waterfall color',
  );
}

function assertAnalysisNoRawInputs(sectionProps) {
  assertEqual('data' in sectionProps, false, 'analysis props should not receive full shortvideo data');
  assertEqual('douyinShortvideoColumns' in sectionProps, false, 'analysis props should not pass raw shortvideo columns');
  assertEqual('isMobile' in sectionProps, false, 'analysis props should not pass raw mobile flag after adapter build');
}

function assertOverviewNoRawInputs(sectionProps) {
  assertEqual('data' in sectionProps, false, 'overview props should not receive full shortvideo data');
  assertEqual('douyinShortvideoColumns' in sectionProps, false, 'overview props should not pass raw shortvideo columns');
  assertEqual('isMobile' in sectionProps, false, 'overview props should not pass raw mobile flag after adapter build');
  assertEqual('waterfallTotalColor' in sectionProps, false, 'overview props should not pass raw waterfall color after adapter build');
}

function assertSectionContainerIsRenderOnly(repoRoot) {
  const sectionPath =
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-shortvideo-sections.tsx';
  const { sourceFile } = parseTsxFile(path.join(repoRoot, sectionPath));

  for (const identifierName of [
    'buildDouyinShortvideoAttributionSectionProps',
    'ColumnsType',
    'DouyinSectionData',
    'DouyinShortvideoRow',
    'isMobile',
    'data',
    'douyinShortvideoColumns',
    'waterfallTotalColor',
  ]) {
    if (hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinShortvideoAttributionSections must stay render-ready: ${identifierName}`);
    }
  }

  if (hasImportSource(sourceFile, 'platform-tab-douyin-shortvideo-section-adapter')) {
    fail('DouyinShortvideoAttributionSections must not import its adapter');
  }
  if (countCallExpressions(sourceFile, 'buildDouyinShortvideoAttributionSubsectionList') > 0) {
    fail('DouyinShortvideoAttributionSections must not build subsection routing directly');
  }
  if (hasImportSource(sourceFile, 'platform-tab-douyin-shortvideo-sections-routing')) {
    fail('DouyinShortvideoAttributionSections must not import subsection routing directly');
  }
  if (countCallExpressions(sourceFile, 'subsectionList.map') !== 1) {
    fail('DouyinShortvideoAttributionSections must render adapter-provided subsectionList');
  }

  if (!hasNamedImport(sourceFile, {
    sourceNeedle: 'platform-tab-douyin-shortvideo-section-contracts',
    importedName: 'DouyinShortvideoAttributionSectionsProps',
  })) {
    fail('DouyinShortvideoAttributionSections missing render contract import');
  }
  if (
    getFunctionParameterType(sourceFile, 'DouyinShortvideoAttributionSections') !==
    'DouyinShortvideoAttributionSectionsProps'
  ) {
    fail('DouyinShortvideoAttributionSections should accept render-ready props directly');
  }
  for (const identifierName of ['subsectionList', 'overviewSectionProps', 'analysisSectionProps']) {
    if (!hasIdentifier(sourceFile, identifierName)) {
      fail(`DouyinShortvideoAttributionSections missing required render prop: ${identifierName}`);
    }
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinShortvideoOverviewSection',
    spreadName: 'overviewSectionProps',
  })) {
    fail('DouyinShortvideoAttributionSections must spread overviewSectionProps into overview section');
  }
  if (!hasJsxElementWithSpread(sourceFile, {
    tagName: 'DouyinShortvideoAnalysisSection',
    spreadName: 'analysisSectionProps',
  })) {
    fail('DouyinShortvideoAttributionSections must spread analysisSectionProps into analysis section');
  }
}

export async function runWeeklyDouyinShortvideoSectionAdapterBehaviorFixtures(assertions) {
  useAssertions(assertions);
  const repoRoot = process.cwd();
  assertSectionContainerIsRenderOnly(repoRoot);

  const {
    buildDouyinShortvideoAttributionSectionProps,
  } = await loadDouyinShortvideoSectionAdapter();

  const sourceProps = makeShortvideoSectionProps();
  const bundle = buildDouyinShortvideoAttributionSectionProps(sourceProps);

  assertKeys(
    bundle,
    ['analysisSectionProps', 'overviewSectionProps', 'subsectionList'],
    'shortvideo adapter should return routing list plus the two shortvideo section prop groups',
  );
  assertEqual(
    bundle.subsectionList.map((section) => section.kind).join('>'),
    'overview>analysis',
    'shortvideo adapter should build subsection routing list in stable order',
  );

  assertOverviewSectionProps(bundle.overviewSectionProps, sourceProps);
  assertAnalysisSectionProps(bundle.analysisSectionProps, sourceProps);
  assertNoCrossLeaks(bundle.overviewSectionProps);
  assertNoCrossLeaks(bundle.analysisSectionProps);
  assertOverviewNoRawInputs(bundle.overviewSectionProps);
  assertAnalysisNoRawInputs(bundle.analysisSectionProps);
}
