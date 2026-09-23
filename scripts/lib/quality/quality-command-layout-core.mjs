import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  getRepoRoot,
} from '../shared/guard-utils.mjs';
import {
  LEGACY_ROOT_CHECK_REFERENCE_ALLOWED_PATHS,
  MIGRATED_LEGACY_CHECK_PATHS,
} from './quality-command-layout-legacy-paths.mjs';

export {
  LEGACY_ROOT_CHECK_REFERENCE_ALLOWED_PATHS,
  MIGRATED_LEGACY_CHECK_PATHS,
} from './quality-command-layout-legacy-paths.mjs';

export const QUALITY_RUNNER_COMMAND_LAYOUT_GUARD_NAME = 'quality-runner-command-layout';

export const ROOT_FLAT_CHECK_LIMIT = 0;
export const ROOT_COMMAND_FILE_PATTERN = /\.(?:cjs|js|mjs|sh)$/;

export const ALLOWED_ROOT_SCRIPT_FILES = Object.freeze([
  'bump-release-version.mjs',
  'deploy-vps.sh',
  'install-git-hooks.sh',
  'quality-runner.mjs',
  'verify-backend.sh',
  'verify-ci.sh',
  'verify-frontend-preflight.sh',
  'vps-up.sh',
]);

export const ALLOWED_LIB_DOMAINS = Object.freeze([
  'ci',
  'contracts',
  'deploy',
  'design',
  'frontend',
  'migrations',
  'quality',
  'repo',
  'reports',
  'security',
  'shared',
  'weekly',
]);

export const RETIRED_LIB_DOMAINS = Object.freeze([
  'frontend-smoke',
]);

export const CHECKS_DOMAIN_FILE_PATTERN = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*\.mjs$/;
const LEGACY_ROOT_CHECK_REFERENCE_PATTERN = /scripts\/check-(?:\*|[A-Za-z0-9_.-]+)(?:\.mjs|\*)?/g;

export function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function listFilesRecursive(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(directory)) {
    const entryPath = path.join(directory, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
    } else if (stats.isFile()) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

export function readFirstLine(filePath) {
  return readFileSync(filePath, 'utf8').split(/\r?\n/, 1)[0] ?? '';
}

export function checkCommandLayout(options = {}) {
  const {
    allowedLibDomains = ALLOWED_LIB_DOMAINS,
    allowedRootScriptFiles = ALLOWED_ROOT_SCRIPT_FILES,
    legacyReferenceAllowedPaths = LEGACY_ROOT_CHECK_REFERENCE_ALLOWED_PATHS,
    migratedLegacyPaths = MIGRATED_LEGACY_CHECK_PATHS,
    repoRoot = getRepoRoot(),
    retiredLibDomains = RETIRED_LIB_DOMAINS,
    rootFlatCheckLimit = ROOT_FLAT_CHECK_LIMIT,
  } = options;

  const findings = [];
  const allowedLibDomainSet = new Set(allowedLibDomains);
  const allowedRootScriptFileSet = new Set(allowedRootScriptFiles);
  const legacyReferenceAllowlist = new Set(legacyReferenceAllowedPaths);
  const retiredLibDomainSet = new Set(retiredLibDomains);
  const scriptsDir = path.join(repoRoot, 'scripts');
  const checksDir = path.join(scriptsDir, 'checks');
  const libDir = path.join(scriptsDir, 'lib');
  const libModuleFiles = listFilesRecursive(libDir).filter((file) => file.endsWith('.mjs'));
  const checkModuleFiles = listFilesRecursive(checksDir).filter((file) => file.endsWith('.mjs'));

  const scriptsRootEntries = existsSync(scriptsDir)
    ? readdirSync(scriptsDir, { withFileTypes: true })
    : [];
  const scriptsRootFiles = scriptsRootEntries
    .filter((entry) => entry.isFile() && ROOT_COMMAND_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const fileName of scriptsRootFiles) {
    if (allowedRootScriptFileSet.has(fileName)) {
      continue;
    }
    findings.push(
      `scripts/${fileName} is not an allowed root script entry; move implementation under scripts/<domain>/ or add a deliberate stable-entry exception`,
    );
  }

  const rootFlatChecks = existsSync(scriptsDir)
    ? readdirSync(scriptsDir)
      .filter((entry) => /^check-.+\.mjs$/.test(entry))
      .sort()
    : [];
  if (rootFlatChecks.length > rootFlatCheckLimit) {
    findings.push(
      `root-level check commands exceed migration baseline: ${rootFlatChecks.length} > ${rootFlatCheckLimit}; put new commands under scripts/checks/<domain>/`,
    );
  }

  for (const legacyPath of migratedLegacyPaths) {
    if (existsSync(path.join(repoRoot, legacyPath))) {
      findings.push(`migrated legacy check path returned: ${legacyPath}`);
    }
  }

  const libRootEntries = existsSync(libDir)
    ? readdirSync(libDir, { withFileTypes: true })
    : [];
  const libRootFiles = libRootEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  for (const fileName of libRootFiles) {
    findings.push(
      `scripts/lib/${fileName} must live under scripts/lib/<domain>/; lib root is reserved for domain folders only`,
    );
  }

  const libRootDomains = libRootEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const domainName of libRootDomains) {
    if (retiredLibDomainSet.has(domainName)) {
      findings.push(`scripts/lib/${domainName}/ is retired; use scripts/lib/frontend/smoke/`);
      continue;
    }
    if (!allowedLibDomainSet.has(domainName)) {
      findings.push(
        `scripts/lib/${domainName}/ is not an approved lib domain; use one of ${allowedLibDomains.join(', ')}`,
      );
    }
  }

  for (const filePath of libModuleFiles) {
    const relativePath = toPosixPath(path.relative(repoRoot, filePath));
    const basename = path.basename(filePath);
    if (basename.startsWith('check-')) {
      findings.push(`${relativePath} must not use check-* naming; scripts/lib is reserved for reusable modules`);
    }
    if (readFirstLine(filePath).startsWith('#!')) {
      findings.push(`${relativePath} must not be executable; move CLI/check entrypoints to scripts/checks/<domain>/`);
    }
  }

  for (const filePath of checkModuleFiles) {
    const relativeToChecks = toPosixPath(path.relative(checksDir, filePath));
    const relativePath = toPosixPath(path.relative(repoRoot, filePath));
    const segments = relativeToChecks.split('/');
    if (segments.length !== 2) {
      findings.push(`${relativePath} must live under scripts/checks/<domain>/<name>.mjs`);
      continue;
    }
    if (!CHECKS_DOMAIN_FILE_PATTERN.test(relativeToChecks)) {
      findings.push(`${relativePath} must use kebab-case domain/name under scripts/checks/<domain>/<name>.mjs`);
    }
    if (path.basename(filePath).startsWith('check-')) {
      findings.push(`${relativePath} should not repeat the check-* prefix inside scripts/checks/`);
    }
  }

  const scannedScriptFiles = [
    ...libModuleFiles,
    ...checkModuleFiles,
  ];
  for (const filePath of scannedScriptFiles) {
    const relativePath = toPosixPath(path.relative(repoRoot, filePath));
    if (legacyReferenceAllowlist.has(relativePath)) {
      continue;
    }
    const source = readFileSync(filePath, 'utf8');
    const legacyReferences = [...new Set(
      [...source.matchAll(LEGACY_ROOT_CHECK_REFERENCE_PATTERN)].map((match) => match[0]),
    )].sort();
    for (const legacyReference of legacyReferences) {
      findings.push(
        `${relativePath} must not reference legacy root check path ${legacyReference}; use scripts/checks/<domain>/<name>.mjs`,
      );
    }
  }

  return findings;
}
