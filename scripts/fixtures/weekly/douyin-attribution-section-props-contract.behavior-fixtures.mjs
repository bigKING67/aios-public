/**
 * Weekly platform tab Douyin attribution section props-contract behavior guard.
 *
 * The Douyin attribution section containers are adapter targets. Their TSX
 * props must stay as thin *PropsBundle wrappers so reusable field contracts
 * live in contract modules instead of render internals.
 */

import path from 'node:path';
import ts from 'typescript';
import {
  normalizeTypeText,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('weekly douyin attribution section props-contract fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function fail(...args) {
  currentAssertions().fail(...args);
}

function hasExportModifier(node) {
  return Boolean(
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function parseSourceFile(repoRoot, relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  return parseTsxFile(filePath).sourceFile;
}

function findInterface(sourceFile, interfaceName) {
  let match = null;

  function visit(node) {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return match;
}

function getPropertyContract(sourceFile, interfaceNode) {
  return interfaceNode.members.map((member) => {
    if (!ts.isPropertySignature(member)) {
      fail(`${interfaceNode.name.text} should only contain property signatures`);
    }

    const nameNode = member.name;
    if (!ts.isIdentifier(nameNode)) {
      fail(`${interfaceNode.name.text} should only use identifier property names`);
    }

    if (!member.type) {
      fail(`${interfaceNode.name.text}.${nameNode.text} should have an explicit type`);
    }

    return {
      name: nameNode.text,
      type: normalizeTypeText(member.type.getText(sourceFile)),
    };
  });
}

function getExtendsContract(sourceFile, interfaceNode) {
  return (interfaceNode.heritageClauses || [])
    .filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
    .flatMap((clause) => clause.types)
    .map((typeNode) => normalizeTypeText(typeNode.getText(sourceFile)));
}

function assertContract(repoRoot, {
  relativePath,
  interfaceName,
  expectedProperties,
  expectedExtends = [],
}) {
  const sourceFile = parseSourceFile(repoRoot, relativePath);
  const interfaceNode = findInterface(sourceFile, interfaceName);

  if (!interfaceNode) {
    fail(`${interfaceName} should exist in ${relativePath}`);
  }

  if (!hasExportModifier(interfaceNode)) {
    fail(`${interfaceName} should be exported from ${relativePath}`);
  }

  const actualExtendsSignature = getExtendsContract(sourceFile, interfaceNode).join('|');
  const expectedExtendsSignature = expectedExtends.join('|');
  assertEqual(
    actualExtendsSignature,
    expectedExtendsSignature,
    `${interfaceName} should keep its explicit inherited props contract`,
  );

  const actualProperties = getPropertyContract(sourceFile, interfaceNode);
  const actualSignature = actualProperties
    .map((property) => `${property.name}:${property.type}`)
    .join('|');
  const expectedSignature = expectedProperties
    .map((property) => `${property.name}:${property.type}`)
    .join('|');

  assertEqual(
    actualSignature,
    expectedSignature,
    `${interfaceName} should keep its narrow adapter-facing props contract`,
  );
}

const DOUYIN_ATTRIBUTION_SECTION_CONTRACT_PATH =
  'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-attribution-section-contracts.ts';

const DOUYIN_ATTRIBUTION_SECTION_PROPS_CONTRACTS = [
  {
    relativePath: DOUYIN_ATTRIBUTION_SECTION_CONTRACT_PATH,
    interfaceName: 'BuildDouyinAttributionSectionPropsParams',
    expectedProperties: [
      { name: 'isMobile', type: 'boolean' },
      { name: 'data', type: 'DouyinSectionData' },
      { name: 'douyinLiveColumns', type: 'ColumnsType<DouyinLiveSessionRow>' },
      { name: 'douyinLiveDetailColumns', type: 'ColumnsType<DouyinMetricDetailRow>' },
      { name: 'douyinShortvideoColumns', type: 'ColumnsType<DouyinShortvideoRow>' },
      { name: 'douyinCardProductColumns', type: 'ColumnsType<DouyinCardProductRow>' },
      { name: 'douyinCardSourceColumns', type: 'ColumnsType<DouyinCardSourceRow>' },
      { name: 'quantColumns', type: 'ColumnsType<QuantAttributionRow>' },
      { name: 'resolveFunnelStageColor', type: '(index: number) => string' },
      { name: 'waterfallTotalColor', type: 'string' },
    ],
  },
  {
    relativePath: DOUYIN_ATTRIBUTION_SECTION_CONTRACT_PATH,
    interfaceName: 'DouyinAttributionSectionPropsBundle',
    expectedProperties: [
      { name: 'channelSectionProps', type: 'DouyinChannelAttributionLeafPropsBundle' },
      { name: 'sectionListProps', type: 'DouyinAttributionSectionListPropsBundle' },
      { name: 'showEmptyAttributionSection', type: 'boolean' },
    ],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-channel-leaf-contracts.ts',
    interfaceName: 'DouyinChannelAttributionLeafPropsBundle',
    expectedProperties: [
      { name: 'donutChartProps', type: 'DonutChartProps | null' },
      { name: 'waterfallChartProps', type: 'WaterfallChartProps | null' },
      { name: 'summaryText', type: 'string' },
    ],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-channel-leaf-contracts.ts',
    interfaceName: 'DouyinChannelAttributionSectionProps',
    expectedExtends: ['DouyinChannelAttributionLeafPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-section-contracts.ts',
    interfaceName: 'DouyinAttributionSectionsProps',
    expectedExtends: ['DouyinAttributionSectionPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-section-list-contracts.ts',
    interfaceName: 'DouyinAttributionSectionListProps',
    expectedExtends: ['DouyinAttributionSectionListPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-live-leaf-contracts.ts',
    interfaceName: 'DouyinLiveSessionAttributionSectionProps',
    expectedExtends: ['DouyinLiveSessionAttributionLeafPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-live-leaf-contracts.ts',
    interfaceName: 'DouyinLiveFunnelAttributionSectionProps',
    expectedExtends: ['DouyinLiveFunnelAttributionLeafPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-live-section-contracts.ts',
    interfaceName: 'DouyinLiveAttributionSectionsProps',
    expectedExtends: ['DouyinLiveAttributionSectionPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-shortvideo-section-contracts.ts',
    interfaceName: 'DouyinShortvideoAttributionSectionsProps',
    expectedExtends: ['DouyinShortvideoAttributionSectionPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-shortvideo-leaf-contracts.ts',
    interfaceName: 'DouyinShortvideoOverviewSectionProps',
    expectedExtends: ['DouyinShortvideoOverviewLeafPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-shortvideo-leaf-contracts.ts',
    interfaceName: 'DouyinShortvideoAnalysisSectionProps',
    expectedExtends: ['DouyinShortvideoAnalysisLeafPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-card-section-contracts.ts',
    interfaceName: 'DouyinCardAttributionSectionsProps',
    expectedExtends: ['DouyinCardAttributionSectionPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-card-leaf-contracts.ts',
    interfaceName: 'DouyinCardProductAttributionSectionProps',
    expectedExtends: ['DouyinCardProductAttributionLeafPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-card-leaf-contracts.ts',
    interfaceName: 'DouyinCardSourceAttributionSectionProps',
    expectedExtends: ['DouyinCardSourceAttributionLeafPropsBundle'],
    expectedProperties: [],
  },
  {
    relativePath: 'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-douyin-card-leaf-contracts.ts',
    interfaceName: 'DouyinCardSourceFunnelSectionProps',
    expectedExtends: ['DouyinCardSourceFunnelLeafPropsBundle'],
    expectedProperties: [],
  },
];

export function runWeeklyDouyinAttributionSectionPropsContractBehaviorFixtures(assertions) {
  useAssertions(assertions);

  const repoRoot = process.cwd();
  DOUYIN_ATTRIBUTION_SECTION_PROPS_CONTRACTS.forEach((contract) => {
    assertContract(repoRoot, contract);
  });
}
