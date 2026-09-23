/**
 * Frontend barrel import audit core.
 *
 * Import frontend modules from their concrete module path instead of broad
 * barrel modules such as `@/components`, `@/lib`, `@/config`, `@/hooks`,
 * `@/types`, or `@/context`. Direct paths keep ownership explicit and prevent
 * broad barrels from becoming hidden cross-module coupling.
 */

import ts from 'typescript';
import {
  createLineStartOffsets,
  lineNumberForOffset,
  listGitFiles,
  readRepoFile,
} from '../shared/guard-utils.mjs';

export const FRONTEND_BARREL_IMPORTS_GUARD_NAME = 'frontend-barrel-imports';

const FRONTEND_SOURCE_ROOTS = Object.freeze(['apps/web-vite']);
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx)$/;
const BLOCKED_SPECIFIERS = Object.freeze([
  '@/components',
  '@/components/atoms',
  '@/components/molecules',
  '@/components/organisms',
  '@/components/states',
  '@/config',
  '@/context',
  '@/hooks',
  '@/lib',
  '@/stores',
  '@/styles',
  '@/theme',
  '@/types',
]);
const BLOCKED_SPECIFIER_SET = new Set(BLOCKED_SPECIFIERS);

export function isFrontendBarrelImportSourceFile(file) {
  return (
    (file.startsWith('apps/web-vite/src/') || file.startsWith('apps/web-vite/')) &&
    SOURCE_FILE_PATTERN.test(file)
  );
}

export function listFrontendBarrelImportSourceFiles(repoRoot) {
  return listGitFiles(FRONTEND_SOURCE_ROOTS, {
    cwd: repoRoot,
    filter: (file) => SOURCE_FILE_PATTERN.test(file),
  });
}

export function frontendBarrelImportSourceKind(file) {
  if (file.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (file.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  return file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

export function collectFrontendBarrelSpecifiers(sourceFile) {
  const specifiers = [];

  function addModuleSpecifier(node) {
    if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push({
        node: node.moduleSpecifier,
        specifier: node.moduleSpecifier.text,
      });
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addModuleSpecifier(node);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push({
        node: node.arguments[0],
        specifier: node.arguments[0].text,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers.filter((item) => BLOCKED_SPECIFIER_SET.has(item.specifier));
}

export function auditFrontendBarrelImportSource(file, sourceText) {
  const parsed = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, frontendBarrelImportSourceKind(file));
  const lineStarts = createLineStartOffsets(sourceText);

  return collectFrontendBarrelSpecifiers(parsed).map(({ node, specifier }) => ({
    file,
    lineNumber: lineNumberForOffset(lineStarts, node.getStart(parsed)),
    specifier,
  }));
}

export function auditFrontendBarrelImportFile(repoRoot, file) {
  return auditFrontendBarrelImportSource(file, readRepoFile(repoRoot, file));
}

export function auditFrontendBarrelImports(repoRoot) {
  const files = listFrontendBarrelImportSourceFiles(repoRoot);
  return {
    files,
    findings: files.flatMap((file) => auditFrontendBarrelImportFile(repoRoot, file)),
  };
}

export function formatFrontendBarrelImportsResult({ files, findings }) {
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[${FRONTEND_BARREL_IMPORTS_GUARD_NAME}] OK: scanned ${files.length} frontend TS/JS files; no frontend barrel imports found.\n`,
      stderr: '',
    };
  }

  const lines = [`[${FRONTEND_BARREL_IMPORTS_GUARD_NAME}] Frontend barrel imports are not allowed in frontend source:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} imports ${finding.specifier}`);
  }
  lines.push(
    '',
    'Import concrete modules directly, for example @/components/organisms/layout, @/lib/request, @/hooks/use-filter, @/types/report, or @/context/filter-context.',
  );

  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}
