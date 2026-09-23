/**
 * Weekly tabs adapter layer audit core.
 *
 * Adapter dependencies should flow inward: orchestrators may call top-level
 * adapters, top-level adapters may call section/list adapters, and section
 * adapters may call leaf adapters. Lower-level adapters must never import
 * higher-level orchestration adapters.
 */

import path from 'node:path';
import {
  createLineStartOffsets,
  lineNumberForOffset,
  listGitFiles,
  readRepoFile,
  resolveRelativeImport,
} from '../shared/guard-utils.mjs';

export const WEEKLY_TABS_ADAPTER_LAYERS_GUARD_NAME = 'weekly-tabs-adapter-layer';

const WEEKLY_TABS_ROOT = 'apps/web-vite/src/app/reports/weekly/_components/tabs';
const IMPORT_PATTERN = /\bfrom\s+['"]([^'"]+)['"]/g;

const SOURCE_LAYER_OVERRIDES = new Map([
  ['overview-tab.tsx', 90],
  ['platform-tab-content-routing.ts', 80],
  ['use-overview-by-week-trend-section-props.ts', 80],
]);

const ADAPTER_LAYER_OVERRIDES = new Map([
  ['overview-tab-content-adapter.ts', 70],
  ['platform-tab-content-adapters.ts', 70],
  ['platform-tab-douyin-section-adapter.ts', 60],
  ['platform-tab-douyin-attribution-section-adapter.ts', 50],
  ['platform-tab-tmall-attribution-section-adapter.ts', 50],
]);

export function listWeeklyAdapterLayerSourceFiles(repoRoot) {
  return listGitFiles([WEEKLY_TABS_ROOT], {
    cwd: repoRoot,
    filter: (file) => /\.(?:ts|tsx)$/.test(file),
  });
}

export function weeklyAdapterLayer(file) {
  const basename = path.basename(file);
  if (ADAPTER_LAYER_OVERRIDES.has(basename)) {
    return ADAPTER_LAYER_OVERRIDES.get(basename);
  }
  if (basename.endsWith('-leaf-adapter.ts')) {
    return 10;
  }
  if (basename.endsWith('-section-adapter.ts')) {
    return 20;
  }
  if (basename.endsWith('-section-list-adapter.ts')) {
    return 30;
  }
  return null;
}

export function weeklyAdapterSourceLayer(file) {
  const basename = path.basename(file);
  if (SOURCE_LAYER_OVERRIDES.has(basename)) {
    return SOURCE_LAYER_OVERRIDES.get(basename);
  }
  return weeklyAdapterLayer(file);
}

export function auditWeeklyAdapterLayerFile(repoRoot, file) {
  const sourceText = readRepoFile(repoRoot, file);
  const lineStartOffsets = createLineStartOffsets(sourceText);
  const findings = [];
  const currentLayer = weeklyAdapterSourceLayer(file);

  IMPORT_PATTERN.lastIndex = 0;
  let match;
  while ((match = IMPORT_PATTERN.exec(sourceText)) !== null) {
    const specifier = match[1];
    const resolvedImport = resolveRelativeImport(repoRoot, file, specifier);
    if (!resolvedImport?.endsWith('-adapter.ts')) {
      continue;
    }

    const importedLayer = weeklyAdapterLayer(resolvedImport);
    if (importedLayer === null) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: `imported adapter has no declared layer (${resolvedImport})`,
        line: match[0].trim(),
      });
      continue;
    }

    if (currentLayer === null) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: 'only adapters and explicit orchestration boundaries may import adapters',
        line: match[0].trim(),
      });
      continue;
    }

    if (currentLayer <= importedLayer) {
      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
        reason: `adapter layer direction violated (${currentLayer} -> ${importedLayer}, target ${resolvedImport})`,
        line: match[0].trim(),
      });
    }
  }

  return findings;
}

export function countWeeklyAdapterImports(repoRoot, files) {
  return files
    .map((file) => readRepoFile(repoRoot, file))
    .reduce((count, sourceText) => {
      IMPORT_PATTERN.lastIndex = 0;
      let fileImportCount = 0;
      let match;
      while ((match = IMPORT_PATTERN.exec(sourceText)) !== null) {
        const specifier = match[1];
        if (specifier.endsWith('-adapter')) {
          fileImportCount += 1;
        }
      }
      return count + fileImportCount;
    }, 0);
}

export function auditWeeklyAdapterLayers(repoRoot) {
  const files = listWeeklyAdapterLayerSourceFiles(repoRoot);
  return {
    files,
    findings: files.flatMap((file) => auditWeeklyAdapterLayerFile(repoRoot, file)),
    importCount: countWeeklyAdapterImports(repoRoot, files),
  };
}

export function formatWeeklyAdapterLayersResult({ files, findings, importCount }) {
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[${WEEKLY_TABS_ADAPTER_LAYERS_GUARD_NAME}] OK: scanned ${files.length} weekly TS/TSX files; ${importCount} adapter imports follow layer direction.\n`,
      stderr: '',
    };
  }

  const lines = [`[${WEEKLY_TABS_ADAPTER_LAYERS_GUARD_NAME}] Weekly adapter layer boundaries were violated:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} ${finding.reason}`);
    lines.push(`  ${finding.line}`);
  }
  lines.push(
    '',
    'Route new data preparation through the correct adapter layer instead of importing peer or higher-level adapters.',
  );

  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}
