/**
 * Weekly tabs exported props boundary audit core.
 *
 * TSX modules may expose local UI primitive/frame props. Adapter-facing section
 * and container props must live in *-contracts.ts files so render modules never
 * become reusable cross-layer contract sources.
 */

import path from 'node:path';
import ts from 'typescript';
import {
  listGitFiles,
  readRepoFile,
} from '../shared/guard-utils.mjs';

export const WEEKLY_TABS_EXPORTED_PROPS_BOUNDARIES_GUARD_NAME = 'weekly-tabs-exported-props-boundary';

const WEEKLY_TABS_ROOT = 'apps/web-vite/src/app/reports/weekly/_components/tabs';

const LOCAL_PROPS_FILE_BASENAME_PREFIXES = ['weekly-'];
const LOCAL_PROPS_FILE_BASENAMES = new Set([
  'platform-tab-attribution-overview-frame.tsx',
  'platform-tab-funnel-overview-frame.tsx',
  'platform-tab-quant-attribution-section-frame.tsx',
]);

export function listWeeklyExportedPropsBoundaryFiles(repoRoot) {
  return listGitFiles([WEEKLY_TABS_ROOT], {
    cwd: repoRoot,
    filter: (file) => file.endsWith('.tsx'),
  });
}

export function parseWeeklyTsxSourceFile(repoRoot, file) {
  const filePath = path.join(repoRoot, file);
  const sourceText = readRepoFile(repoRoot, file);
  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

export function hasExportModifier(node) {
  return Boolean(
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

export function isWeeklyPropsName(name) {
  return name.endsWith('Props');
}

export function isWeeklyLocalPropsFile(file) {
  const basename = path.basename(file);
  return (
    LOCAL_PROPS_FILE_BASENAMES.has(basename) ||
    LOCAL_PROPS_FILE_BASENAME_PREFIXES.some((prefix) => basename.startsWith(prefix))
  );
}

export function getWeeklySourceLineNumber(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function auditWeeklyExportedPropsFile(repoRoot, file) {
  const sourceFile = parseWeeklyTsxSourceFile(repoRoot, file);
  const findings = [];

  function visit(node) {
    if (
      ts.isInterfaceDeclaration(node) &&
      hasExportModifier(node) &&
      isWeeklyPropsName(node.name.text) &&
      !isWeeklyLocalPropsFile(file)
    ) {
      findings.push({
        file,
        lineNumber: getWeeklySourceLineNumber(sourceFile, node),
        reason:
          'exported TSX props are only allowed for local UI primitives/frames; section contracts should live in *-contracts.ts',
        line: node.name.text,
      });
    }

    if (
      ts.isTypeAliasDeclaration(node) &&
      hasExportModifier(node) &&
      isWeeklyPropsName(node.name.text) &&
      !isWeeklyLocalPropsFile(file)
    ) {
      findings.push({
        file,
        lineNumber: getWeeklySourceLineNumber(sourceFile, node),
        reason:
          'exported TSX props type aliases are only allowed for local UI primitives/frames; section contracts should live in *-contracts.ts',
        line: node.name.text,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

export function auditWeeklyExportedPropsBoundaries(repoRoot) {
  const files = listWeeklyExportedPropsBoundaryFiles(repoRoot);
  const findings = files.flatMap((file) => auditWeeklyExportedPropsFile(repoRoot, file));

  return {
    files,
    findings,
  };
}

export function formatWeeklyExportedPropsBoundariesResult({ files, findings }) {
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[${WEEKLY_TABS_EXPORTED_PROPS_BOUNDARIES_GUARD_NAME}] OK: scanned ${files.length} TSX files; non-local exported props stay out of TSX.\n`,
      stderr: '',
    };
  }

  const lines = [`[${WEEKLY_TABS_EXPORTED_PROPS_BOUNDARIES_GUARD_NAME}] Weekly TSX exported props boundaries were violated:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} ${finding.reason}`);
    lines.push(`  ${finding.line}`);
  }
  lines.push(
    '',
    'Move reusable adapter-facing props into *-contracts.ts as *PropsBundle, or make purely local props non-exported.',
  );

  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}
