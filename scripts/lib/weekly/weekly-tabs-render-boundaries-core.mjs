/**
 * Weekly tabs render boundary audit core.
 *
 * Section/container TSX files should stay render-ready: they may receive
 * prepared props, but they must not rebuild AntD table columns or inline raw
 * table props. Columns live in *-columns.tsx; the only direct AntD Table render
 * lives in WeeklyDataTable.tsx.
 */

import path from 'node:path';
import {
  createLineStartOffsets,
  lineNumberForOffset,
  listGitFiles,
  readRepoFile,
} from '../shared/guard-utils.mjs';

export const WEEKLY_TABS_RENDER_BOUNDARIES_GUARD_NAME = 'weekly-tabs-render-boundary';

const WEEKLY_TABS_ROOT = 'apps/web-vite/src/app/reports/weekly/_components/tabs';
const WEEKLY_DATA_TABLE_PATH = `${WEEKLY_TABS_ROOT}/weekly-data-table.tsx`;

const COLUMNS_IMPORT_PATTERN = /\bColumnsType\b|['"]antd\/es\/table['"]/g;
const DIRECT_TABLE_IMPORT_PATTERN =
  /\bimport\s+(?:type\s+)?(?:\{[^}]*\bTable\b[^}]*\}|[^'"]*\bTableProps\b[^'"]*)\s+from\s+['"]antd['"]/g;
const DIRECT_TABLE_JSX_PATTERN = /<Table(?:\b|<)/g;
const RAW_TABLE_PROP_PATTERN = /\b(?:rowKey|dataSource|pagination|scroll)\s*(?::|=)/g;
const RAW_SECTION_DATA_PATTERN = /\b(?:DouyinSectionData|TmallSectionData)\b/g;
const ADAPTER_IMPORT_PATTERN = /\bfrom\s+['"][^'"]*-adapter['"]/g;
const ALLOWED_TSX_ADAPTER_IMPORTS = new Set([
  `${WEEKLY_TABS_ROOT}/overview-tab.tsx`,
]);

export function listWeeklyRenderBoundaryTsxFiles(repoRoot) {
  return listGitFiles([WEEKLY_TABS_ROOT], {
    cwd: repoRoot,
    filter: (file) => file.endsWith('.tsx'),
  });
}

export function collectWeeklyRenderBoundaryFindings({
  file,
  text,
  pattern,
  reason,
}) {
  const lineStartOffsets = createLineStartOffsets(text);
  const findings = [];
  pattern.lastIndex = 0;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const lineEnd = text.indexOf('\n', match.index);
    findings.push({
      file,
      lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
      reason,
      line: text.slice(match.index, lineEnd === -1 ? text.length : lineEnd).trim(),
    });
  }

  return findings;
}

export function isWeeklyColumnBuilderFile(file) {
  return path.basename(file).endsWith('-columns.tsx');
}

export function isWeeklyAdapterImportAllowed(file) {
  return ALLOWED_TSX_ADAPTER_IMPORTS.has(file);
}

export function auditWeeklyRenderBoundaryFile(repoRoot, file) {
  const text = readRepoFile(repoRoot, file);
  const findings = [];

  if (!isWeeklyColumnBuilderFile(file)) {
    findings.push(
      ...collectWeeklyRenderBoundaryFindings({
        file,
        text,
        pattern: COLUMNS_IMPORT_PATTERN,
        reason: 'ColumnsType is only allowed in *-columns.tsx builders',
      }),
    );
  }

  if (file !== WEEKLY_DATA_TABLE_PATH) {
    findings.push(
      ...collectWeeklyRenderBoundaryFindings({
        file,
        text,
        pattern: DIRECT_TABLE_IMPORT_PATTERN,
        reason: 'AntD Table import is only allowed in WeeklyDataTable.tsx',
      }),
      ...collectWeeklyRenderBoundaryFindings({
        file,
        text,
        pattern: DIRECT_TABLE_JSX_PATTERN,
        reason: 'Direct <Table> rendering is only allowed in WeeklyDataTable.tsx',
      }),
    );
  }

  findings.push(
    ...collectWeeklyRenderBoundaryFindings({
      file,
      text,
      pattern: RAW_TABLE_PROP_PATTERN,
      reason: 'raw table props must be built in table-prop adapters, not TSX sections',
    }),
    ...collectWeeklyRenderBoundaryFindings({
      file,
      text,
      pattern: RAW_SECTION_DATA_PATTERN,
      reason: 'raw platform section data must stay in adapters/data helpers, not TSX sections',
    }),
  );

  if (!isWeeklyAdapterImportAllowed(file)) {
    findings.push(
      ...collectWeeklyRenderBoundaryFindings({
        file,
        text,
        pattern: ADAPTER_IMPORT_PATTERN,
        reason: 'adapter imports are only allowed at explicit tab orchestration boundaries',
      }),
    );
  }

  return findings;
}

export function auditWeeklyRenderBoundaries(repoRoot) {
  const files = listWeeklyRenderBoundaryTsxFiles(repoRoot);
  return {
    files,
    findings: files.flatMap((file) => auditWeeklyRenderBoundaryFile(repoRoot, file)),
  };
}

export function formatWeeklyRenderBoundariesResult({ files, findings }) {
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[${WEEKLY_TABS_RENDER_BOUNDARIES_GUARD_NAME}] OK: scanned ${files.length} TSX files; render boundaries are clean.\n`,
      stderr: '',
    };
  }

  const lines = [`[${WEEKLY_TABS_RENDER_BOUNDARIES_GUARD_NAME}] Weekly TSX render boundaries were violated:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} ${finding.reason}`);
    lines.push(`  ${finding.line}`);
  }
  lines.push(
    '',
    'Move column/table/section-data construction into adapters or dedicated builders, then pass render-ready props into TSX sections.',
  );

  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}
