/**
 * Weekly tabs contract layer audit core.
 *
 * Contract dependencies should flow from broader orchestration contracts toward
 * narrower section/list/leaf contracts. This prevents reusable contracts from
 * turning into a cyclic cross-module type graph.
 */

import path from 'node:path';
import {
  createLineStartOffsets,
  lineNumberForOffset,
  listGitFiles,
  readRepoFile,
  resolveRelativeImport,
} from '../shared/guard-utils.mjs';

export const WEEKLY_TABS_CONTRACT_LAYERS_GUARD_NAME = 'weekly-tabs-contract-layer';

const WEEKLY_TABS_ROOT = 'apps/web-vite/src/app/reports/weekly/_components/tabs';
const IMPORT_PATTERN = /\bfrom\s+['"]([^'"]+)['"]/g;

const CONTRACT_LAYER_OVERRIDES = new Map([
  ['platform-tab-douyin-section-contracts.ts', 70],
  ['platform-tab-douyin-attribution-section-contracts.ts', 60],
  ['platform-tab-tmall-attribution-section-contracts.ts', 60],
]);

export function listWeeklyContractLayerFiles(repoRoot) {
  return listGitFiles([WEEKLY_TABS_ROOT], {
    cwd: repoRoot,
    filter: (file) => file.endsWith('-contracts.ts'),
  });
}

export function weeklyContractLayer(file) {
  const basename = path.basename(file);
  if (CONTRACT_LAYER_OVERRIDES.has(basename)) {
    return CONTRACT_LAYER_OVERRIDES.get(basename);
  }
  if (basename.endsWith('-content-contracts.ts')) {
    return 70;
  }
  if (basename.endsWith('-section-list-contracts.ts')) {
    return 50;
  }
  if (basename.endsWith('-section-contracts.ts')) {
    return 40;
  }
  if (basename.endsWith('-leaf-contracts.ts')) {
    return 10;
  }
  if (basename === 'platform-tab-column-contracts.ts') {
    return 5;
  }
  return null;
}

export function weeklyContractImports(repoRoot, file) {
  const sourceText = readRepoFile(repoRoot, file);
  const lineStartOffsets = createLineStartOffsets(sourceText);
  const imports = [];

  IMPORT_PATTERN.lastIndex = 0;
  let match;
  while ((match = IMPORT_PATTERN.exec(sourceText)) !== null) {
    const specifier = match[1];
    const resolvedImport = resolveRelativeImport(repoRoot, file, specifier);
    if (!resolvedImport?.endsWith('-contracts.ts')) {
      continue;
    }

    imports.push({
      target: resolvedImport,
      lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
      line: match[0].trim().replace(/\s+/g, ' '),
    });
  }

  return imports;
}

export function findWeeklyContractLayerCycles(adjacency) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = [];

  function visit(file) {
    if (visiting.has(file)) {
      const cycleStart = stack.indexOf(file);
      if (cycleStart >= 0) {
        cycles.push([...stack.slice(cycleStart), file]);
      }
      return;
    }

    if (visited.has(file)) {
      return;
    }

    visiting.add(file);
    stack.push(file);
    for (const target of adjacency.get(file) ?? []) {
      visit(target);
    }
    stack.pop();
    visiting.delete(file);
    visited.add(file);
  }

  for (const file of adjacency.keys()) {
    visit(file);
  }

  return cycles;
}

export function auditWeeklyContractLayers(repoRoot) {
  const contractFiles = listWeeklyContractLayerFiles(repoRoot);
  const findings = [];
  const adjacency = new Map(contractFiles.map((file) => [file, []]));
  let contractImportCount = 0;

  for (const file of contractFiles) {
    const currentLayer = weeklyContractLayer(file);
    if (currentLayer === null) {
      findings.push({
        file,
        lineNumber: 1,
        reason: 'contract file has no declared layer',
        line: path.basename(file),
      });
      continue;
    }

    for (const contractImport of weeklyContractImports(repoRoot, file)) {
      contractImportCount += 1;
      adjacency.get(file)?.push(contractImport.target);

      const importedLayer = weeklyContractLayer(contractImport.target);
      if (importedLayer === null) {
        findings.push({
          file,
          lineNumber: contractImport.lineNumber,
          reason: `imported contract has no declared layer (${contractImport.target})`,
          line: contractImport.line,
        });
        continue;
      }

      if (currentLayer <= importedLayer) {
        findings.push({
          file,
          lineNumber: contractImport.lineNumber,
          reason: `contract layer direction violated (${currentLayer} -> ${importedLayer}, target ${contractImport.target})`,
          line: contractImport.line,
        });
      }
    }
  }

  const cycles = findWeeklyContractLayerCycles(adjacency);
  for (const cycle of cycles) {
    findings.push({
      file: cycle[0],
      lineNumber: 1,
      reason: 'contract dependency cycle detected',
      line: cycle.join(' -> '),
    });
  }

  return {
    contractFiles,
    contractImportCount,
    findings,
  };
}

export function formatWeeklyContractLayersResult({
  contractFiles,
  contractImportCount,
  findings,
}) {
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[${WEEKLY_TABS_CONTRACT_LAYERS_GUARD_NAME}] OK: scanned ${contractFiles.length} contract files; ${contractImportCount} contract imports follow layer direction.\n`,
      stderr: '',
    };
  }

  const lines = [`[${WEEKLY_TABS_CONTRACT_LAYERS_GUARD_NAME}] Weekly contract layers were violated:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} ${finding.reason}`);
    lines.push(`  ${finding.line}`);
  }
  lines.push(
    '',
    'Keep contract imports flowing from content/orchestration contracts down to section-list, section, and leaf contracts.',
  );

  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}
