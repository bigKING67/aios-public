import path from 'node:path';
import {
  createLineStartOffsets,
  lineNumberForOffset,
  listGitFiles,
  readRepoFile,
  toPosixPath,
} from '../shared/guard-utils.mjs';

export const SOURCE_ROOT = 'apps/web-vite/src';
export const WEEKLY_TABS_ROOT = 'apps/web-vite/src/app/reports/weekly/_components/tabs';
export const STYLE_MODULE_PATH = `${WEEKLY_TABS_ROOT}/weekly-modern.module.css`;
export const WEEKLY_PRIMITIVE_MODULE_PATTERN = [
  'weekly-attribution-layout',
  'weekly-block',
  'weekly-chart-layout',
  'weekly-data-table',
  'weekly-diagnosis-card',
  'weekly-empty-state',
  'weekly-funnel-chart',
  'weekly-funnel-visual-card',
  'weekly-inline-summary',
  'weekly-kpi-card',
  'weekly-kpi-grid',
  'weekly-kpi-trend-rows',
  'weekly-metric-cells',
  'weekly-page-stack',
  'weekly-priority-tag',
  'weekly-quant-header',
  'weekly-section-header',
  'weekly-table-cell-props',
  'weekly-text',
  'weekly-text-cell',
  'weekly-trend-style',
  'weekly-trend-text',
].join('|');
export const ALLOWED_DIRECT_IMPORT_FILE_PATTERN = new RegExp(`^(?:${WEEKLY_PRIMITIVE_MODULE_PATTERN})\\.(?:ts|tsx)$`);
export const WEEKLY_PRIMITIVES_BARREL_PATH = `${WEEKLY_TABS_ROOT}/weekly-primitives.ts`;
export const WEEKLY_COLUMN_CELLS_PATH = `${WEEKLY_TABS_ROOT}/platform-tab-column-cells.tsx`;
export const WEEKLY_COLUMN_CELL_PROPS_PATH = `${WEEKLY_TABS_ROOT}/platform-tab-column-cell-props.ts`;
export const WEEKLY_PRIMITIVE_PATH_PATTERN = new RegExp(`^${WEEKLY_TABS_ROOT}/(?:${WEEKLY_PRIMITIVE_MODULE_PATTERN})$`);
export const WEEKLY_PRIMITIVES_SPECIFIER = './weekly-primitives';
export const TABLE_CELL_PRIMITIVE_IMPORTS = new Set([
  'WeeklyCurrencyTrendCell',
  'WeeklyPlainTextCell',
  'WeeklyPriorityTag',
  'WeeklyRawMetricTrendCell',
  'WeeklyTrendText',
  'createWeeklyFrozenHeaderCellProps',
  'createWeeklyTableCellProps',
]);
export const CLASS_CONSTANT_EXPORT_PATTERN = /\bexport\s+const\s+([A-Z0-9_]+_CLASS)\b/g;
export const IMPORT_EXPORT_PATTERN =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
export const NAMED_IMPORT_FROM_WEEKLY_PRIMITIVES_PATTERN =
  /\bimport\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+['"]\.\/weekly-primitives['"]/g;

export function listWeeklyTabsStyleBoundarySourceFiles(repoRoot) {
  return listGitFiles([SOURCE_ROOT], {
    cwd: repoRoot,
    filter: (file) => /\.(?:ts|tsx|js|jsx)$/.test(file),
  });
}

export function resolveWeeklyTabsStyleBoundarySpecifier(repoRoot, file, specifier) {
  if (specifier === '@' || specifier.startsWith('@/')) {
    return specifier.replace(/^@\//, 'apps/web-vite/src/');
  }
  if (specifier === 'apps/web-vite/src' || specifier.startsWith('apps/web-vite/src/')) {
    return specifier;
  }
  if (!specifier.startsWith('.')) {
    return null;
  }

  return toPosixPath(
    path.relative(repoRoot, path.resolve(repoRoot, path.dirname(file), specifier)),
  );
}

export function auditWeeklyTabsStyleBoundaryFile(repoRoot, file) {
  const text = readRepoFile(repoRoot, file);
  const lineStartOffsets = createLineStartOffsets(text);
  const violations = [];
  const directImports = [];
  const primitiveImportViolations = [];
  const tableCellPrimitiveImportViolations = [];
  const classConstantExports = [];

  IMPORT_EXPORT_PATTERN.lastIndex = 0;
  let match;
  while ((match = IMPORT_EXPORT_PATTERN.exec(text)) !== null) {
    const specifier = match[1] ?? match[2];
    const lineNumber = lineNumberForOffset(lineStartOffsets, match.index);
    const lineEnd = text.indexOf('\n', match.index);
    const finding = {
      file,
      lineNumber,
      line: text.slice(match.index, lineEnd === -1 ? text.length : lineEnd).trim(),
    };

    const resolvedPath = specifier ? resolveWeeklyTabsStyleBoundarySpecifier(repoRoot, file, specifier) : null;

    if (resolvedPath && WEEKLY_PRIMITIVE_PATH_PATTERN.test(resolvedPath)) {
      const canDirectlyConsumePrimitive =
        file === WEEKLY_PRIMITIVES_BARREL_PATH ||
        file === WEEKLY_COLUMN_CELL_PROPS_PATH ||
        (path.dirname(file) === WEEKLY_TABS_ROOT &&
          ALLOWED_DIRECT_IMPORT_FILE_PATTERN.test(path.basename(file)));

      if (!canDirectlyConsumePrimitive) {
        primitiveImportViolations.push(finding);
      }
    }

    if (resolvedPath !== STYLE_MODULE_PATH) {
      continue;
    }

    directImports.push(finding);

    if (
      path.dirname(file) !== WEEKLY_TABS_ROOT ||
      !ALLOWED_DIRECT_IMPORT_FILE_PATTERN.test(path.basename(file))
    ) {
      violations.push(finding);
    }
  }

  NAMED_IMPORT_FROM_WEEKLY_PRIMITIVES_PATTERN.lastIndex = 0;
  while ((match = NAMED_IMPORT_FROM_WEEKLY_PRIMITIVES_PATTERN.exec(text)) !== null) {
    if (file === WEEKLY_COLUMN_CELLS_PATH) {
      continue;
    }

    const importedNames = match[1]
      .split(',')
      .map((name) => name.replace(/\btype\s+/, '').trim().split(/\s+as\s+/)[0]?.trim())
      .filter(Boolean);
    const restrictedNames = importedNames.filter((name) => TABLE_CELL_PRIMITIVE_IMPORTS.has(name));

    if (restrictedNames.length === 0) {
      continue;
    }

    tableCellPrimitiveImportViolations.push({
      file,
      lineNumber: lineNumberForOffset(lineStartOffsets, match.index),
      names: restrictedNames,
      line: `import { ${restrictedNames.join(', ')} } from '${WEEKLY_PRIMITIVES_SPECIFIER}'`,
    });
  }

  CLASS_CONSTANT_EXPORT_PATTERN.lastIndex = 0;
  while ((match = CLASS_CONSTANT_EXPORT_PATTERN.exec(text)) !== null) {
    const lineNumber = lineNumberForOffset(lineStartOffsets, match.index);
    const lineEnd = text.indexOf('\n', match.index);
    classConstantExports.push({
      file,
      lineNumber,
      name: match[1],
      line: text.slice(match.index, lineEnd === -1 ? text.length : lineEnd).trim(),
    });
  }

  return {
    directImports,
    violations,
    primitiveImportViolations,
    tableCellPrimitiveImportViolations,
    classConstantExports,
  };
}

export function auditWeeklyTabsStyleBoundaries(repoRoot, files = listWeeklyTabsStyleBoundarySourceFiles(repoRoot)) {
  const audits = files.map((file) => auditWeeklyTabsStyleBoundaryFile(repoRoot, file));

  return {
    files,
    directImports: audits.flatMap((audit) => audit.directImports),
    violations: audits.flatMap((audit) => audit.violations),
    primitiveImportViolations: audits.flatMap((audit) => audit.primitiveImportViolations),
    tableCellPrimitiveImportViolations: audits.flatMap((audit) => audit.tableCellPrimitiveImportViolations),
    classConstantExports: audits.flatMap((audit) => audit.classConstantExports),
  };
}

export function formatWeeklyTabsStyleBoundaryFailures(audit) {
  if (audit.violations.length > 0) {
    return [
      '[weekly-tabs-style-boundary] Direct weekly-modern.module.css imports are restricted to Weekly* primitives:',
      ...audit.violations.flatMap((violation) => [
        `- ${violation.file}:${violation.lineNumber}`,
        `  ${violation.line}`,
      ]),
      '',
      'Move the style consumption into a Weekly* primitive/contract, then compose that primitive from platform or business tab files.',
    ].join('\n');
  }

  if (audit.primitiveImportViolations.length > 0) {
    return [
      '[weekly-tabs-style-boundary] Platform/business weekly tab files must import Weekly primitives through ./weekly-primitives:',
      ...audit.primitiveImportViolations.flatMap((violation) => [
        `- ${violation.file}:${violation.lineNumber}`,
        `  ${violation.line}`,
      ]),
      '',
      'Move the concrete Weekly* import/export behind weekly-primitives.ts, then consume that barrel from platform or business tab files.',
    ].join('\n');
  }

  if (audit.tableCellPrimitiveImportViolations.length > 0) {
    return [
      '[weekly-tabs-style-boundary] Platform/business weekly tab files must consume table cell primitives through platform-tab-column-cells:',
      ...audit.tableCellPrimitiveImportViolations.flatMap((violation) => [
        `- ${violation.file}:${violation.lineNumber} imports ${violation.names.join(', ')}`,
        `  ${violation.line}`,
      ]),
      '',
      'Move table-cell-specific primitive usage behind platform-tab-column-cells.tsx before composing weekly platform columns.',
    ].join('\n');
  }

  if (audit.classConstantExports.length > 0) {
    return [
      '[weekly-tabs-style-boundary] Exported *_CLASS constants are forbidden in weekly tabs:',
      ...audit.classConstantExports.flatMap((classConstantExport) => [
        `- ${classConstantExport.file}:${classConstantExport.lineNumber} exports ${classConstantExport.name}`,
        `  ${classConstantExport.line}`,
      ]),
      '',
      'Expose semantic Weekly* components or prop builders instead of exporting raw CSS class strings.',
    ].join('\n');
  }

  return null;
}

export function summarizeWeeklyTabsStyleBoundaryAudit(audit) {
  return `${audit.directImports.length} direct weekly style imports, all inside Weekly* primitives.`;
}
