import path from 'node:path';
import {
  auditCappedCountFiles,
  buildCappedCountAllowlist,
  createLineStartOffsets,
  lineNumberForOffset,
  listGitFiles,
  readRequiredFile,
  readRequiredJsonFile,
  toPosixPath,
} from '../shared/guard-utils.mjs';

export const CONFIG_PATH = 'scripts/config/allowlists/app-module-boundary-allowlist.json';
export const APP_ROOT = 'apps/web-vite/src/app';
export const IMPORT_EXPORT_PATTERN =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function throwFailure(message) {
  throw new Error(message);
}

function getFailureHandler(options = {}) {
  return options.fail ?? throwFailure;
}

export function normalizeAppModuleBoundaryConfig(config, options = {}) {
  const failWith = getFailureHandler(options);
  if (config.version !== 1) {
    failWith(`${CONFIG_PATH} must use version 1`);
  }
  if (!Array.isArray(config.moduleRoots)) {
    failWith(`${CONFIG_PATH} moduleRoots must be an array`);
  }
  if (!Array.isArray(config.allowed)) {
    failWith(`${CONFIG_PATH} allowed must be an array`);
  }

  const moduleRoots = [...new Set(config.moduleRoots)]
    .filter((moduleRoot) => typeof moduleRoot === 'string' && moduleRoot.startsWith(`${APP_ROOT}/`))
    .sort((left, right) => right.length - left.length);

  if (moduleRoots.length !== config.moduleRoots.length) {
    failWith(`${CONFIG_PATH} moduleRoots must contain only apps/web-vite/src/app/* paths`);
  }

  const allowlist = buildCappedCountAllowlist(config, CONFIG_PATH, failWith, {
    capField: 'maxCrossModuleImports',
  });

  return { moduleRoots, allowlist };
}

export function buildAppModuleBoundaryConfig(config, options = {}) {
  return normalizeAppModuleBoundaryConfig(config, options);
}

export function readAppModuleBoundaryConfig(repoRoot, options = {}) {
  const failWith = getFailureHandler(options);
  const config = readRequiredJsonFile(repoRoot, CONFIG_PATH, failWith, {
    missingMessage: `missing ${CONFIG_PATH}`,
  });
  return normalizeAppModuleBoundaryConfig(config, { fail: failWith });
}

export function listAppModuleBoundarySourceFiles(repoRoot) {
  return listGitFiles([APP_ROOT], {
    cwd: repoRoot,
    filter: (file) => /\.(?:ts|tsx|js|jsx)$/.test(file),
  });
}

export function resolveAppImport(repoRoot, file, specifier) {
  if (specifier === '@/app' || specifier.startsWith('@/app/')) {
    return specifier.replace(/^@\//, 'apps/web-vite/src/');
  }
  if (specifier === 'apps/web-vite/src/app' || specifier.startsWith('apps/web-vite/src/app/')) {
    return specifier;
  }
  if (!specifier.startsWith('.')) {
    return null;
  }

  const resolved = toPosixPath(
    path.relative(repoRoot, path.resolve(repoRoot, path.dirname(file), specifier)),
  );
  return resolved === APP_ROOT || resolved.startsWith(`${APP_ROOT}/`) ? resolved : null;
}

export function getAppModuleRoot(fileOrImportPath, moduleRoots) {
  const normalized = fileOrImportPath.replace(/\/+$/, '');
  for (const moduleRoot of moduleRoots) {
    if (normalized === moduleRoot || normalized.startsWith(`${moduleRoot}/`)) {
      return moduleRoot;
    }
  }

  return null;
}

export function auditAppModuleBoundarySource({
  file,
  moduleRoots,
  repoRoot,
  text,
}) {
  const lineStartOffsets = createLineStartOffsets(text);
  const sourceRoot = getAppModuleRoot(file, moduleRoots);
  if (!sourceRoot) {
    return [];
  }
  const findings = [];

  IMPORT_EXPORT_PATTERN.lastIndex = 0;
  let match;
  while ((match = IMPORT_EXPORT_PATTERN.exec(text)) !== null) {
    const specifier = match[1] ?? match[2];
    const targetPath = specifier ? resolveAppImport(repoRoot, file, specifier) : null;
    if (!targetPath) {
      continue;
    }

    const targetRoot = getAppModuleRoot(targetPath, moduleRoots);
    if (!targetRoot) {
      continue;
    }
    if (targetRoot === sourceRoot) {
      continue;
    }

    const lineNumber = lineNumberForOffset(lineStartOffsets, match.index);
    const lineEnd = text.indexOf('\n', match.index);
    findings.push({
      file,
      lineNumber,
      sourceRoot,
      targetRoot,
      specifier,
      line: text.slice(match.index, lineEnd === -1 ? text.length : lineEnd).trim(),
    });
  }

  return findings;
}

export function auditAppModuleBoundaryFile(repoRoot, file, moduleRoots, options = {}) {
  const failWith = getFailureHandler(options);
  return auditAppModuleBoundarySource({
    file,
    moduleRoots,
    repoRoot,
    text: readRequiredFile(repoRoot, file, failWith),
  });
}

export function checkAppModuleBoundaries({
  allowlist,
  files,
  moduleRoots,
  readFile,
  repoRoot,
}) {
  const auditByFile = new Map();
  const auditResult = auditCappedCountFiles(files, allowlist, {
    capField: 'maxCrossModuleImports',
    countFindings(file) {
      const findings = readFile
        ? auditAppModuleBoundarySource({
          file,
          moduleRoots,
          repoRoot,
          text: readFile(file),
        })
        : auditAppModuleBoundaryFile(repoRoot, file, moduleRoots);
      const audit = { file, findings, count: findings.length };
      auditByFile.set(file, audit);
      return audit;
    },
    createViolation({ audit, count, maxCount }) {
      return {
        file: audit.file,
        count,
        maxCrossModuleImports: maxCount,
        findings: audit.findings,
        reason:
          maxCount === 0
            ? 'non-allowlisted app module imports sibling or parent route internals'
            : 'cross-module imports exceeded frozen cap',
      };
    },
  });
  const total = files.reduce((sum, file) => sum + (auditByFile.get(file)?.count ?? 0), 0);
  return {
    ...auditResult,
    auditByFile,
    total,
  };
}

export function formatAppModuleBoundaryViolationFailures(violations) {
  if (violations.length === 0) {
    return null;
  }

  return [
    '[app-module-boundary] App module boundary violations found.',
    '[app-module-boundary] Extract shared code to apps/web-vite/src/components/apps/web-vite/src/lib/apps/web-vite/src/hooks, or keep route-specific code inside its owning module. Existing cross-module imports are frozen and must not grow.',
    '',
    ...violations.flatMap((violation) => [
      `- ${violation.file}: ${violation.count} > ${violation.maxCrossModuleImports}`,
      `  ${violation.reason}`,
      ...violation.findings.slice(0, 8).flatMap((finding) => [
        `  ${finding.file}:${finding.lineNumber}: ${finding.sourceRoot} -> ${finding.targetRoot} (${finding.specifier})`,
        `    ${finding.line}`,
      ]),
    ]),
  ].join('\n');
}

export function formatAppModuleBoundarySummary(total) {
  return total === 0
    ? 'clean baseline; no frozen cross-module imports.'
    : `${total} frozen cross-module imports.`;
}
