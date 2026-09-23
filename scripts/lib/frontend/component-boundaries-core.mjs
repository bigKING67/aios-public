import path from 'node:path';
import {
  createLineStartOffsets,
  getRepoRoot,
  lineNumberForOffset,
  listGitFiles,
  readRepoFile,
  toPosixPath,
} from '../shared/guard-utils.mjs';

const COMPONENT_ROOT = 'apps/web-vite/src/components';
const FORBIDDEN_ALIAS_PREFIXES = ['@/app', 'apps/web-vite/src/app'];
const IMPORT_EXPORT_PATTERN =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function listComponentBoundarySourceFiles(repoRoot) {
  return listGitFiles([COMPONENT_ROOT], {
    cwd: repoRoot,
    filter: (file) => /\.(?:ts|tsx|js|jsx)$/.test(file),
  });
}

export function isForbiddenComponentBoundarySpecifier(repoRoot, file, specifier) {
  if (FORBIDDEN_ALIAS_PREFIXES.some((prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`))) {
    return true;
  }

  if (!specifier.startsWith('.')) {
    return false;
  }

  const normalizedImportPath = toPosixPath(
    path.relative(repoRoot, path.resolve(repoRoot, path.dirname(file), specifier)),
  );
  return normalizedImportPath === 'apps/web-vite/src/app' || normalizedImportPath.startsWith('apps/web-vite/src/app/');
}

export function auditComponentBoundaryFile(repoRoot, file) {
  const text = readRepoFile(repoRoot, file);
  const violations = [];
  const lineStartOffsets = createLineStartOffsets(text);

  IMPORT_EXPORT_PATTERN.lastIndex = 0;
  let match;
  while ((match = IMPORT_EXPORT_PATTERN.exec(text)) !== null) {
    const specifier = match[1] ?? match[2];
    if (!specifier || !isForbiddenComponentBoundarySpecifier(repoRoot, file, specifier)) {
      continue;
    }

    const lineNumber = lineNumberForOffset(lineStartOffsets, match.index);
    const lineEnd = text.indexOf('\n', match.index);
    violations.push({
      file,
      lineNumber,
      specifier,
      line: text.slice(match.index, lineEnd === -1 ? text.length : lineEnd).trim(),
    });
  }

  return violations;
}

export function checkComponentBoundaries(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const hasExplicitFiles = Object.hasOwn(options, 'files');
  const files = hasExplicitFiles ? options.files : listComponentBoundarySourceFiles(repoRoot);
  const violations = files.flatMap((file) => auditComponentBoundaryFile(repoRoot, file));

  return { files, violations };
}

export function formatComponentBoundariesResult(result) {
  const { files, violations } = result;

  if (violations.length > 0) {
    const stderrLines = ['[component-boundary] Shared component imports from apps/web-vite/src/app are forbidden:'];
    for (const violation of violations) {
      stderrLines.push(`- ${violation.file}:${violation.lineNumber} imports ${violation.specifier}`);
      stderrLines.push(`  ${violation.line}`);
    }
    stderrLines.push(
      '',
      'Move route/domain logic into apps/web-vite/src/app, or extract reusable logic into apps/web-vite/src/lib, apps/web-vite/src/hooks, apps/web-vite/src/types, or apps/web-vite/src/components with a stable shared API.',
    );
    return {
      status: 1,
      stderr: `${stderrLines.join('\n')}\n`,
      stdout: '',
    };
  }

  return {
    status: 0,
    stderr: '',
    stdout: `[component-boundary] OK: scanned ${files.length} shared component files; no apps/web-vite/src/app dependencies found.\n`,
  };
}
