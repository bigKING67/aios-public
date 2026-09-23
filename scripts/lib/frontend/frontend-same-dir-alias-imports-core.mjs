/**
 * Frontend same-directory alias import audit core.
 *
 * Use local relative imports for files in the same directory. `@/...` aliases
 * are useful for cross-domain dependencies, but they hide local cohesion when
 * used between siblings and make module boundaries harder to read.
 */

import path from 'node:path';
import ts from 'typescript';
import {
  lineNumberForOffset,
  listGitFiles,
  readRepoFile,
  repoFileExists,
} from '../shared/guard-utils.mjs';

export const FRONTEND_SAME_DIR_ALIAS_IMPORTS_GUARD_NAME = 'frontend-same-dir-alias-imports';

const FRONTEND_SOURCE_ROOTS = Object.freeze(['apps/web-vite']);
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx)$/;
const RESOLVABLE_EXTENSIONS = Object.freeze(['.ts', '.tsx', '.js', '.jsx', '.css']);

export function isFrontendSameDirAliasSourceFile(file) {
  return (
    (file.startsWith('apps/web-vite/src/') || file.startsWith('apps/web-vite/')) &&
    SOURCE_FILE_PATTERN.test(file)
  );
}

export function listFrontendSameDirAliasSourceFiles(repoRoot) {
  return listGitFiles(FRONTEND_SOURCE_ROOTS, {
    cwd: repoRoot,
    filter: (file) => SOURCE_FILE_PATTERN.test(file),
  });
}

export function frontendSameDirAliasSourceKind(file) {
  if (file.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (file.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  return file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

export function createFrontendSameDirAliasLineStartOffsets(sourceText) {
  const offsets = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === '\n') {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

export function resolveFrontendSameDirAliasImportWithExists(fileExists, specifier) {
  if (!specifier.startsWith('@/')) {
    return null;
  }

  const basePath = `apps/web-vite/src/${specifier.slice(2)}`;
  const candidates = [
    basePath,
    ...RESOLVABLE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...RESOLVABLE_EXTENSIONS.map((extension) => `${basePath}/index${extension}`),
  ];

  return candidates.find((candidate) => fileExists(candidate)) ?? null;
}

export function resolveFrontendSameDirAliasImport(repoRoot, specifier) {
  return resolveFrontendSameDirAliasImportWithExists(
    (candidate) => repoFileExists(repoRoot, candidate),
    specifier,
  );
}

export function frontendSameDirAliasLocalReplacement(sourceFile, targetFile, specifier) {
  const relative = path
    .relative(path.dirname(sourceFile), targetFile)
    .replaceAll(path.sep, '/');
  const withoutExtension = relative.replace(/\.(?:ts|tsx|js|jsx|css)$/, '');
  const normalized = withoutExtension.startsWith('.') ? withoutExtension : `./${withoutExtension}`;

  if (specifier.endsWith('/index') || targetFile.endsWith('/index.ts') || targetFile.endsWith('/index.tsx')) {
    return normalized.replace(/\/index$/, '');
  }

  return normalized;
}

export function collectFrontendSameDirAliasModuleSpecifiers(sourceFile) {
  const specifiers = [];

  function addSpecifier(node) {
    if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push({
        node: node.moduleSpecifier,
        specifier: node.moduleSpecifier.text,
      });
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addSpecifier(node);
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
  return specifiers;
}

export function auditFrontendSameDirAliasSource(file, sourceText, fileExists) {
  const parsed = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, frontendSameDirAliasSourceKind(file));
  const lineStarts = createFrontendSameDirAliasLineStartOffsets(sourceText);
  const findings = [];

  for (const { node, specifier } of collectFrontendSameDirAliasModuleSpecifiers(parsed)) {
    const targetFile = resolveFrontendSameDirAliasImportWithExists(fileExists, specifier);
    if (!targetFile) {
      continue;
    }
    if (path.dirname(file) !== path.dirname(targetFile)) {
      continue;
    }

    findings.push({
      file,
      lineNumber: lineNumberForOffset(lineStarts, node.getStart(parsed)),
      specifier,
      targetFile,
      replacement: frontendSameDirAliasLocalReplacement(file, targetFile, specifier),
    });
  }

  return findings;
}

export function auditFrontendSameDirAliasFile(repoRoot, file) {
  return auditFrontendSameDirAliasSource(
    file,
    readRepoFile(repoRoot, file),
    (candidate) => repoFileExists(repoRoot, candidate),
  );
}

export function auditFrontendSameDirAliasFiles(repoRoot, files) {
  return files.flatMap((file) => auditFrontendSameDirAliasFile(repoRoot, file));
}

export function auditFrontendSameDirAliasImports(repoRoot) {
  const files = listFrontendSameDirAliasSourceFiles(repoRoot);
  return {
    files,
    findings: auditFrontendSameDirAliasFiles(repoRoot, files),
  };
}

export function formatFrontendSameDirAliasImportsResult({ files, findings }) {
  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[${FRONTEND_SAME_DIR_ALIAS_IMPORTS_GUARD_NAME}] OK: scanned ${files.length} frontend TS/JS files; no same-directory alias imports found.\n`,
      stderr: '',
    };
  }

  const lines = [`[${FRONTEND_SAME_DIR_ALIAS_IMPORTS_GUARD_NAME}] Same-directory frontend imports should be relative:`];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} imports ${finding.specifier}`);
    lines.push(`  target: ${finding.targetFile}`);
    lines.push(`  use: ${finding.replacement}`);
  }
  lines.push(
    '',
    'Keep @/... aliases for cross-domain imports. For sibling modules, use ./... so local cohesion stays obvious.',
  );

  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}
