import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

export const ZERO_SHA = '0000000000000000000000000000000000000000';

const RELEASE_METADATA_FILES = new Set([
  'CHANGELOG.md',
  'README.md',
  'docs/RELEASE_VERSIONING.md',
  'scripts/bump-release-version.mjs',
]);

const IGNORED_FILE_PATTERNS = Object.freeze([
  /^\.cache\//u,
  /^\.trellis\/tasks\//u,
  /^apps\/web-vite\/dist\//u,
]);

const QUALITY_INFRASTRUCTURE_FILES = Object.freeze([
  /^\.github\/workflows\/quality-gate\.yml$/u,
  /^\.trellis\/scripts\/.+\.py$/u,
  /^eslint\.config\.[cm]?js$/u,
  /^docs\/QUALITY_GATE_RUNNER\.md$/u,
  /^tsconfig\.frontend\.json$/u,
  /^scripts\/(?:deploy-vps\.sh|install-git-hooks\.sh|quality-runner\.mjs|verify-[A-Za-z0-9-]+\.sh|vps-up\.sh)$/u,
  /^scripts\/(?:build|ci|fixtures|frontend|ops)\/.+\.(?:js|mjs|sh)$/u,
  /^scripts\/checks\/.+\.(?:mjs|py|sh)$/u,
  /^scripts\/lib\/.+\.mjs$/u,
]);

const LOCAL_DEVELOPMENT_OPERATION_FILES = new Set([
  'start-services.sh',
  'stop-services.sh',
]);

const QUALITY_INFRASTRUCTURE_GITIGNORE_LINES = Object.freeze([
  /^\.cache\/aios-quality\/$/u,
  /^\.cache\/aios-quality-remote\/$/u,
  /^\.cache\/eslint\/$/u,
  /^\.cache\/tsc\/$/u,
]);

const LINT_CACHE_MIGRATION_COMMANDS = Object.freeze([
  'eslint .',
  'eslint . --cache --cache-location .cache/eslint/ --cache-strategy content',
  'eslint . --cache --cache-location .cache/eslint/full/ --cache-strategy content',
  'eslint eslint.config.mjs postcss.config.js scripts backend-rust/scripts --cache --cache-location .cache/eslint/full/ --cache-strategy content',
  'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts --no-error-on-unmatched-pattern --cache --cache-location .cache/eslint/full/ --cache-strategy content',
  'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts --cache --cache-location .cache/eslint/full/ --cache-strategy content',
  'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts apps/web-vite/vitest.coverage.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts --cache --cache-location .cache/eslint/full/ --cache-strategy content',
]);

const LINT_SURFACE_COMMANDS_BY_SCRIPT = Object.freeze({
  'lint:scripts': new Set([
    'eslint scripts eslint.config.mjs backend-rust/scripts --cache --cache-location .cache/eslint/scripts/ --cache-strategy content',
  ]),
});

const TYPE_CHECK_CACHE_MIGRATION_COMMANDS = Object.freeze([
  'tsc --noEmit',
  'tsc --noEmit --tsBuildInfoFile .cache/tsc/tsconfig.tsbuildinfo',
  'tsc -p tsconfig.frontend.json --noEmit',
  'tsc -p tsconfig.frontend.json --noEmit --tsBuildInfoFile .cache/tsc/frontend.tsbuildinfo',
]);

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function parseVersion(version) {
  if (!VERSION_PATTERN.test(String(version ?? ''))) {
    throw new Error(`unsupported version format: ${version}; expected X.Y.Z`);
  }
  return String(version).split('.').map((part) => Number.parseInt(part, 10));
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function parseChangedFileEntry(entry) {
  if (entry && typeof entry === 'object' && typeof entry.file === 'string') {
    return {
      file: entry.file,
      status: String(entry.status ?? '').trim(),
    };
  }

  const text = String(entry ?? '').trim();
  const match = text.match(/^((?:[RC]\d{1,3})|[ MARCDAU?!]{1,2}|\?\?)\s*:\s*(.+)$/u);
  if (!match) {
    return {
      file: text,
      status: '',
    };
  }
  return {
    file: match[2].trim(),
    status: match[1].trim(),
  };
}

export function parseChangedFiles(value) {
  if (Array.isArray(value)) {
    return value.map(parseChangedFileEntry).filter((entry) => entry.file);
  }
  return String(value ?? '')
    .split(/\r?\n|,/u)
    .map(parseChangedFileEntry)
    .filter((entry) => entry.file);
}

export function git(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trimEnd();
}

export function hasRef(repoRoot, ref) {
  if (!ref || ref === ZERO_SHA) {
    return false;
  }
  try {
    git(repoRoot, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function readRepoFile(repoRoot, file) {
  return readFileSync(path.join(repoRoot, file), 'utf8');
}

function readGitFile(repoRoot, ref, file) {
  return git(repoRoot, ['show', `${ref}:${file}`]);
}

export function createEndpointFileReader(repoRoot, endpoint, options = {}) {
  const cache = new Map();
  const readGit = options.readGitFile ?? readGitFile;
  const readRepo = options.readRepoFile ?? readRepoFile;
  const ref = endpoint?.ref ?? null;

  return (file) => {
    if (cache.has(file)) {
      return cache.get(file);
    }

    let source = '';
    try {
      source = ref ? readGit(repoRoot, ref, file) : readRepo(repoRoot, file);
    } catch {
      source = '';
    }
    cache.set(file, source);
    return source;
  };
}

export function readChangedFilesFromGit(repoRoot, baseRef, headRef) {
  if (!baseRef) {
    return [];
  }
  const args = ['diff', '--name-status', '--find-renames', baseRef];
  if (headRef) {
    args.push(headRef);
  }
  return git(repoRoot, args)
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [status, ...parts] = line.split('\t');
      return {
        file: parts.at(-1),
        status,
      };
    })
    .filter((entry) => entry.file);
}

function packageJsonWithoutVersion(source) {
  const payload = parseJson(source, 'package.json');
  delete payload.version;
  return payload;
}

function packageLockWithoutRootVersion(source) {
  const payload = parseJson(source, 'package-lock.json');
  delete payload.version;
  if (payload.packages?.['']) {
    delete payload.packages[''].version;
  }
  return payload;
}

function fileDiffersIgnoringReleaseVersion(file, previousSource, currentSource) {
  if (file === 'package.json') {
    return stableJson(packageJsonWithoutVersion(previousSource)) !== stableJson(packageJsonWithoutVersion(currentSource));
  }
  if (file === 'package-lock.json') {
    return stableJson(packageLockWithoutRootVersion(previousSource)) !== stableJson(packageLockWithoutRootVersion(currentSource));
  }
  return previousSource !== currentSource;
}

function isIgnoredFile(file) {
  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(file));
}

function isQualityInfrastructureFile(file) {
  return QUALITY_INFRASTRUCTURE_FILES.some((pattern) => pattern.test(file));
}

function isLocalDevelopmentOperationFile(file) {
  return LOCAL_DEVELOPMENT_OPERATION_FILES.has(file);
}

function isReleaseMetadataOnlyFile(file, previousSource, currentSource) {
  if (RELEASE_METADATA_FILES.has(file)) {
    return true;
  }
  if (file === 'package.json' || file === 'package-lock.json') {
    return !fileDiffersIgnoringReleaseVersion(file, previousSource, currentSource);
  }
  return false;
}

function isDocsOnlyFile(file) {
  return file.endsWith('.md') || file.startsWith('docs/');
}

function isReleaseImpactingFile(file, sources = {}) {
  if (!file || isIgnoredFile(file)) {
    return false;
  }
  if (file === '.gitignore' && gitIgnoreChangeIsQualityInfrastructureOnly(sources.previousSource ?? '', sources.currentSource ?? '')) {
    return false;
  }
  if (file === 'package.json' && packageJsonChangeIsQualityInfrastructureOnly(sources.previousSource ?? '', sources.currentSource ?? '')) {
    return false;
  }
  if (isReleaseMetadataOnlyFile(file, sources.previousSource ?? '', sources.currentSource ?? '')) {
    return false;
  }
  if (isDocsOnlyFile(file)) {
    return false;
  }
  if (isLocalDevelopmentOperationFile(file)) {
    return false;
  }
  if (isQualityInfrastructureFile(file)) {
    return false;
  }
  return true;
}

export function releaseImpactingClassificationNeedsFileSource(file) {
  return file === '.gitignore'
    || file === 'package.json'
    || file === 'package-lock.json';
}

function scriptChangeIsQualityInfrastructure(scriptName, previousCommand, currentCommand) {
  if (
    scriptName.startsWith('verify:app:')
    || scriptName.startsWith('verify:backend')
    || scriptName.startsWith('verify:components:')
    || scriptName.startsWith('verify:css-modules:')
    || scriptName.startsWith('verify:quality:')
    || scriptName.startsWith('verify:quality-runner')
    || scriptName.startsWith('verify:ci:')
    || scriptName.startsWith('verify:dataops')
    || scriptName.startsWith('verify:design:')
    || scriptName.startsWith('verify:frontend:')
    || scriptName.startsWith('verify:repo:')
    || scriptName.startsWith('verify:shell:')
    || scriptName.startsWith('verify:weekly:')
  ) {
    return true;
  }
  if (scriptName === 'lint') {
    const previous = String(previousCommand ?? '').trim();
    const current = String(currentCommand ?? '').trim();
    return LINT_CACHE_MIGRATION_COMMANDS.includes(previous)
      && LINT_CACHE_MIGRATION_COMMANDS.includes(current);
  }
  if (scriptName === 'type-check') {
    const previous = String(previousCommand ?? '').trim();
    const current = String(currentCommand ?? '').trim();
    return TYPE_CHECK_CACHE_MIGRATION_COMMANDS.includes(previous)
      && TYPE_CHECK_CACHE_MIGRATION_COMMANDS.includes(current);
  }
  const lintSurfaceCommands = LINT_SURFACE_COMMANDS_BY_SCRIPT[scriptName];
  if (!lintSurfaceCommands) {
    return false;
  }
  const previous = String(previousCommand ?? '').trim();
  const current = String(currentCommand ?? '').trim();
  return (!previous || lintSurfaceCommands.has(previous))
    && lintSurfaceCommands.has(current);
}

function packageJsonChangeIsQualityInfrastructureOnly(previousSource, currentSource) {
  let previousPackage;
  let currentPackage;
  try {
    previousPackage = parseJson(previousSource, 'previous package.json');
    currentPackage = parseJson(currentSource, 'current package.json');
  } catch {
    return false;
  }
  const previousScripts = previousPackage.scripts ?? {};
  const currentScripts = currentPackage.scripts ?? {};
  delete previousPackage.scripts;
  delete currentPackage.scripts;
  if (stableJson(previousPackage) !== stableJson(currentPackage)) {
    return false;
  }
  const scriptNames = new Set([
    ...Object.keys(previousScripts),
    ...Object.keys(currentScripts),
  ]);
  let hasDiff = false;
  for (const scriptName of scriptNames) {
    if (previousScripts[scriptName] === currentScripts[scriptName]) {
      continue;
    }
    hasDiff = true;
    if (!scriptChangeIsQualityInfrastructure(scriptName, previousScripts[scriptName], currentScripts[scriptName])) {
      return false;
    }
  }
  return hasDiff;
}

function gitIgnoreChangeIsQualityInfrastructureOnly(previousSource, currentSource) {
  const previousLines = new Set(String(previousSource ?? '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean));
  const currentLines = new Set(String(currentSource ?? '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean));
  const changedLines = [
    ...[...previousLines].filter((line) => !currentLines.has(line)),
    ...[...currentLines].filter((line) => !previousLines.has(line)),
  ];
  return changedLines.length > 0
    && changedLines.every((line) => QUALITY_INFRASTRUCTURE_GITIGNORE_LINES.some((pattern) => pattern.test(line)));
}

function changelogHasVersionSection(source, version) {
  return new RegExp(`^## ${version.replace(/\./gu, '\\.')} - \\d{4}-\\d{2}-\\d{2}\\s*$`, 'mu').test(source);
}

export function classifyReleaseImpactingFiles(changedFiles, sourceReader = () => ({})) {
  const entries = parseChangedFiles(changedFiles);
  const releaseImpactingFiles = [];
  const seen = new Set();

  for (const entry of entries) {
    const file = entry.file;
    if (!file || seen.has(file)) {
      continue;
    }
    seen.add(file);

    const sources = releaseImpactingClassificationNeedsFileSource(file)
      ? sourceReader(file)
      : {};

    if (isReleaseImpactingFile(file, {
      previousSource: sources.previousSource ?? '',
      currentSource: sources.currentSource ?? '',
    })) {
      releaseImpactingFiles.push(file);
    }
  }

  return releaseImpactingFiles;
}

function releaseBumpFindings(options = {}) {
  const {
    changedFiles = [],
    currentFiles,
    previousFiles,
    releaseImpactingFiles: explicitReleaseImpactingFiles = null,
  } = options;

  const releaseImpactingFiles = explicitReleaseImpactingFiles ?? classifyReleaseImpactingFiles(
    changedFiles,
    (file) => ({
      previousSource: previousFiles?.[file] ?? '',
      currentSource: currentFiles?.[file] ?? '',
    }),
  );

  if (releaseImpactingFiles.length === 0) {
    return [];
  }

  const findings = [];
  const previousPackage = parseJson(previousFiles['package.json'], 'previous package.json');
  const currentPackage = parseJson(currentFiles['package.json'], 'current package.json');
  const previousVersion = previousPackage.version;
  const currentVersion = currentPackage.version;

  if (compareVersions(currentVersion, previousVersion) <= 0) {
    findings.push(
      `release-impacting changes require package.json version to increase from ${previousVersion}; current is ${currentVersion}`,
    );
  }

  const currentPackageLock = parseJson(currentFiles['package-lock.json'], 'current package-lock.json');
  if (currentPackageLock.version !== currentVersion) {
    findings.push(`package-lock.json top-level version must be ${currentVersion}`);
  }
  if (currentPackageLock.packages?.['']?.version !== currentVersion) {
    findings.push(`package-lock.json packages[""].version must be ${currentVersion}`);
  }

  if (!currentFiles['README.md']?.includes(`当前版本：\`${currentVersion}\``)) {
    findings.push(`README.md must show 当前版本：\`${currentVersion}\``);
  }

  if (!changelogHasVersionSection(currentFiles['CHANGELOG.md'] ?? '', currentVersion)) {
    findings.push(`CHANGELOG.md must contain a release section for ${currentVersion}`);
  }

  return findings;
}

export function checkReleaseVersionBump(options = {}) {
  const findings = releaseBumpFindings(options);
  return {
    findings,
    ok: findings.length === 0,
  };
}
