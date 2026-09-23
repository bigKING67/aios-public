/**
 * Weekly behavior guard helpers.
 *
 * Generic guard helpers live in scripts/lib/shared/guard-utils.mjs so behavior,
 * boundary, and registry guards share the same reporting/assertion surface.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export const WEEKLY_TABS_ROOT = 'apps/web-vite/src/app/reports/weekly/_components/tabs';

const DEFAULT_WEEKLY_BEHAVIOR_BUNDLE_EXTERNALS = [
  'react',
  'react-dom',
  'echarts',
  'antd',
  '@ant-design/icons',
];

export function createWeeklyTabsEntrySource(repoRoot, moduleName, exportNames) {
  return [
    'export {',
    ...exportNames.map((exportName) => `  ${exportName},`),
    `} from ${JSON.stringify(path.join(repoRoot, WEEKLY_TABS_ROOT, moduleName))};`,
    '',
  ].join('\n');
}

export async function importBundledWeeklyBehaviorEntry(options) {
  const {
    entrySource,
    external = DEFAULT_WEEKLY_BEHAVIOR_BUNDLE_EXTERNALS,
    repoRoot = process.cwd(),
    tempPrefix,
  } = options;
  const tempDir = mkdtempSync(path.join(tmpdir(), tempPrefix));
  const entryPath = path.join(tempDir, 'entry.ts');
  const outputPath = path.join(tempDir, 'bundle.mjs');
  const normalizedEntrySource = Array.isArray(entrySource) ? entrySource.join('\n') : entrySource;

  writeFileSync(entryPath, normalizedEntrySource, 'utf8');

  await build({
    entryPoints: [entryPath],
    outfile: outputPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    external,
    alias: {
      '@': path.join(repoRoot, 'apps/web-vite/src'),
    },
    logLevel: 'silent',
  });

  try {
    return await import(pathToFileURL(outputPath).href);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function withWeeklyTempTextFile(options) {
  const {
    callback,
    fileName = 'fixture.tsx',
    sourceText,
    tempPrefix,
  } = options;
  const tempDir = mkdtempSync(path.join(tmpdir(), tempPrefix));
  const filePath = path.join(tempDir, fileName);

  try {
    writeFileSync(filePath, sourceText, 'utf8');
    return callback(filePath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export {
  createCheckGuard as createWeeklyGuard,
  createCheckGuard as createWeeklyBehaviorGuard,
  readRepoFile,
  readTextFile,
} from '../shared/guard-utils.mjs';
