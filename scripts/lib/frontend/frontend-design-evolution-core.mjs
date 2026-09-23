/**
 * Guards design-evolution frontend work.
 *
 * Route-level redesign/new-page work may intentionally move beyond the current
 * DESIGN.md baseline, but it must update DESIGN.md in the same change set so
 * future frontend routing has a real style authority instead of stale prose.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  getRepoRoot,
} from '../shared/guard-utils.mjs';

const GUARD_NAME = 'frontend-design-evolution';
const DESIGN_AUTHORITY_PATH = 'DESIGN.md';
const CHANGED_FILES_ENV = 'FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES';
const REQUIRED_ENV = 'FRONTEND_DESIGN_EVOLUTION_REQUIRED';
const STYLE_AUTHORITY_MODE_ENV = 'FRONTEND_STYLE_AUTHORITY_MODE';
const BASE_ENV = 'FRONTEND_DESIGN_EVOLUTION_BASE';

const PAGE_FILE_PATTERN = /^apps\/web-vite\/src\/app\/(?:.+\/)?page\.tsx$/;
const ROUTE_STYLE_PATTERN = /^apps\/web-vite\/src\/app\/(?:.+\/)?[^/]+\.module\.css$/;
const PRIVATE_ROUTE_SEGMENT_PATTERN = /\/_(?:components|lib|hooks|utils|fixtures|tests)(?:\/|$)/;
const STRUCTURAL_SHARED_STYLE_SUFFIX = '-shared.module.css';

const SUPPORTING_AUTHORITY_PATTERNS = Object.freeze([
  /^DESIGN_TOKENS\.json$/,
  /^apps\/web-vite\/src\/styles\/design-tokens\.css$/,
  /^apps\/web-vite\/src\/lib\/design-tokens\.ts$/,
  /^apps\/web-vite\/src\/lib\/design-token-values\.ts$/,
  /^apps\/web-vite\/src\/theme\/.+\.(?:ts|tsx|css)$/,
  /^apps\/web-vite\/src\/styles\/.+design.+\.css$/,
  /^tailwind\.config\.(?:js|mjs|cjs|ts)$/,
  /^docs\/.*design.*\.md$/i,
]);

const GIT_REPOSITORY_ENV_KEYS = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_WORK_TREE',
]);

function gitCommandEnv() {
  const env = { ...process.env };
  // Pre-push hooks export the outer repo's GIT_* variables; nested fixture
  // git commands must resolve against their own cwd instead.
  for (const key of GIT_REPOSITORY_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

function runGit(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: gitCommandEnv(),
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function runGitRaw(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: gitCommandEnv(),
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function runGitLines(repoRoot, args) {
  return runGitRaw(repoRoot, args)
    .split(/\r?\n/)
    .filter(Boolean);
}

function normalizeRepoPath(filePath) {
  return String(filePath ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function parseEnvChangedFiles(value) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^((?:[RC]\d{1,3})|[ MARCDAU?!]{1,2}|\?\?)\s*:\s*(.+)$/);
      if (!match) {
        return {
          file: normalizeRepoPath(item),
          source: CHANGED_FILES_ENV,
          status: '',
        };
      }
      return {
        file: normalizeRepoPath(match[2]),
        source: CHANGED_FILES_ENV,
        status: match[1].trim() || 'M',
      };
    })
    .filter((entry) => entry.file);
}

export function parseFrontendDesignEvolutionGitStatusLine(line) {
  if (!line || line.length < 4) {
    return null;
  }

  const status = line.slice(0, 2);
  let file = line.slice(3).trim();
  if (file.includes(' -> ')) {
    file = file.split(' -> ').at(-1).trim();
  }
  if (file.startsWith('"') && file.endsWith('"')) {
    file = file.slice(1, -1);
  }

  return {
    file: normalizeRepoPath(file),
    source: 'git status',
    status,
  };
}

function parseGitNameStatusLine(line) {
  if (!line) {
    return null;
  }
  const [status, ...fileParts] = line.split('\t');
  const file = fileParts.at(-1);
  if (!status || !file) {
    return null;
  }

  return {
    file: normalizeRepoPath(file),
    source: 'git diff',
    status,
  };
}

function hasGitRef(repoRoot, ref) {
  try {
    runGit(repoRoot, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function defaultDiffBases(repoRoot) {
  const explicitBase = process.env[BASE_ENV]?.trim();
  if (explicitBase) {
    return [explicitBase];
  }

  return ['origin/main', 'main']
    .filter((ref) => hasGitRef(repoRoot, ref));
}

function createHeadPathLookup(repoRoot) {
  let headPaths = null;
  return function pathExistsInHeadLookup(file) {
    if (headPaths === null) {
      try {
        headPaths = new Set(runGitLines(repoRoot, ['ls-tree', '-r', '--name-only', 'HEAD']).map(normalizeRepoPath));
      } catch {
        headPaths = false;
      }
    }
    if (headPaths === false) {
      return pathExistsInHead(repoRoot, file);
    }
    return headPaths.has(normalizeRepoPath(file));
  };
}

function listChangedEntries(repoRoot, options = {}) {
  const explicitFiles = options.changedFilesEnv ?? process.env[CHANGED_FILES_ENV];
  if (explicitFiles?.trim()) {
    return dedupeEntries(parseEnvChangedFiles(explicitFiles), repoRoot);
  }

  const entries = [];

  for (const base of defaultDiffBases(repoRoot)) {
    try {
      entries.push(
        ...runGit(repoRoot, ['diff', '--name-status', '--find-renames', `${base}...HEAD`])
          .split(/\r?\n/)
          .map(parseGitNameStatusLine)
          .filter(Boolean),
      );
      break;
    } catch {
      // Fall through to the next available base and then to worktree status.
    }
  }

  try {
    entries.push(
      ...runGitRaw(repoRoot, ['status', '--short', '--untracked-files=all'])
        .split(/\r?\n/)
        .map(parseFrontendDesignEvolutionGitStatusLine)
        .filter(Boolean),
    );
  } catch {
    // A non-git fixture falls back to the entries discovered above.
  }

  return dedupeEntries(entries, repoRoot);
}

function dedupeEntries(entries, repoRoot) {
  const byFile = new Map();
  const pathExistsInHeadLookup = createHeadPathLookup(repoRoot);
  for (const entry of entries) {
    if (!entry.file) {
      continue;
    }
    const previous = byFile.get(entry.file);
    byFile.set(entry.file, {
      ...entry,
      isNew: isNewChange(repoRoot, entry, pathExistsInHeadLookup),
      status: previous ? `${previous.status},${entry.status}` : entry.status,
    });
  }
  return [...byFile.values()].sort((left, right) => left.file.localeCompare(right.file));
}

function pathExistsInHead(repoRoot, file) {
  try {
    runGit(repoRoot, ['cat-file', '-e', `HEAD:${file}`]);
    return true;
  } catch {
    return false;
  }
}

function isNewChange(repoRoot, entry, pathExistsInHeadLookup = (file) => pathExistsInHead(repoRoot, file)) {
  const status = entry.status.trim();
  if (status.includes('?') || status.includes('A') || status.startsWith('R')) {
    return true;
  }
  if (status.includes('D')) {
    return false;
  }

  const fullPath = path.join(repoRoot, entry.file);
  if (!existsSync(fullPath)) {
    return false;
  }

  if (entry.source === CHANGED_FILES_ENV && status) {
    // Explicit changed-file manifests are the quality-runner fast path. Avoid
    // per-file `git cat-file` calls when the status already proves the file is
    // a normal modification; ambiguous statusless entries still probe HEAD.
    return false;
  }

  return !pathExistsInHeadLookup(entry.file);
}

function isRouteStyle(file) {
  return ROUTE_STYLE_PATTERN.test(file) && !PRIVATE_ROUTE_SEGMENT_PATTERN.test(file);
}

function isStructuralRouteStyleSplit(entry, entries) {
  if (!entry.isNew || !isRouteStyle(entry.file) || !entry.file.endsWith(STRUCTURAL_SHARED_STYLE_SUFFIX)) {
    return false;
  }

  const directory = path.posix.dirname(entry.file);
  const routeSegment = path.posix.basename(directory);
  const expectedSharedStyle = `${directory}/${routeSegment}${STRUCTURAL_SHARED_STYLE_SUFFIX}`;
  const expectedShellStyle = `${directory}/${routeSegment}.module.css`;

  if (entry.file !== expectedSharedStyle) {
    return false;
  }

  return entries.some((candidate) => (
    candidate.file === expectedShellStyle
    && isRouteStyle(candidate.file)
    && !candidate.isNew
    && !candidate.status.includes('D')
  ));
}

function cssModuleBaseName(file) {
  return path.posix.basename(file).replace(/\.module\.css$/, '');
}

function hasStructuralRouteStyleNameRelationship(newFile, existingFile) {
  const newBase = cssModuleBaseName(newFile);
  const existingBase = cssModuleBaseName(existingFile);

  if (newBase.startsWith(`${existingBase}-`)) {
    return true;
  }

  const newParts = newBase.split('-').filter(Boolean);
  const existingParts = existingBase.split('-').filter(Boolean);
  let sharedParts = 0;
  for (let index = 0; index < Math.min(newParts.length, existingParts.length); index += 1) {
    if (newParts[index] !== existingParts[index]) {
      break;
    }
    sharedParts += 1;
  }

  return sharedParts >= 2 && newParts.slice(0, sharedParts).join('-').length >= 8;
}

function isStructuralSiblingRouteStyleSplit(entry, entries) {
  if (!entry.isNew || !isRouteStyle(entry.file)) {
    return false;
  }

  const directory = path.posix.dirname(entry.file);
  return entries.some((candidate) => (
    candidate.file !== entry.file
    && path.posix.dirname(candidate.file) === directory
    && isRouteStyle(candidate.file)
    && !candidate.isNew
    && !candidate.status.includes('D')
    && hasStructuralRouteStyleNameRelationship(entry.file, candidate.file)
  ));
}

function isDesignAuthorityUpdate(file) {
  return file === DESIGN_AUTHORITY_PATH;
}

function isSupportingAuthorityUpdate(file) {
  return SUPPORTING_AUTHORITY_PATTERNS.some((pattern) => pattern.test(file));
}

function booleanEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function styleAuthorityMode(options = {}) {
  return String(options.styleAuthorityModeEnv ?? process.env[STYLE_AUTHORITY_MODE_ENV])
    .trim()
    .toLowerCase();
}

function collectCandidateTriggers(entries) {
  const triggers = [];

  for (const entry of entries) {
    if (entry.isNew && PAGE_FILE_PATTERN.test(entry.file)) {
      triggers.push({
        file: entry.file,
        reason: `new frontend route page (${entry.status.trim() || 'changed'})`,
      });
      continue;
    }

    if (entry.isNew && isRouteStyle(entry.file)) {
      if (isStructuralRouteStyleSplit(entry, entries) || isStructuralSiblingRouteStyleSplit(entry, entries)) {
        continue;
      }
      triggers.push({
        file: entry.file,
        reason: `new route-level CSS module (${entry.status.trim() || 'changed'})`,
      });
    }
  }

  return triggers;
}

function collectEvolutionTriggers(entries, options = {}) {
  const triggers = [];
  const mode = styleAuthorityMode(options);

  if (booleanEnv(options.requiredEnv ?? process.env[REQUIRED_ENV])) {
    triggers.push({
      file: `<env:${REQUIRED_ENV}>`,
      reason: 'explicit design evolution requirement',
    });
  }

  if (mode === 'evolve') {
    triggers.push({
      file: `<env:${STYLE_AUTHORITY_MODE_ENV}>`,
      reason: 'style authority mode is evolve',
    });
  }

  // The route planner's explicit enforce mode is the auditable non-evolution
  // classification. It keeps new route shells inside the current DESIGN.md
  // baseline, but never overrides an explicit evolution requirement above.
  if (mode !== 'enforce') {
    triggers.push(...collectCandidateTriggers(entries));
  }

  return triggers;
}

export function checkFrontendDesignEvolution(options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const entries = options.entries ?? listChangedEntries(repoRoot, options);
  const changedFiles = entries.map((entry) => entry.file);
  const mode = styleAuthorityMode(options);
  const candidateTriggers = collectCandidateTriggers(entries);
  const triggers = collectEvolutionTriggers(entries, options);
  const supportingAuthorityUpdates = changedFiles
    .filter(isSupportingAuthorityUpdate)
    .filter((file) => !isDesignAuthorityUpdate(file));

  if (triggers.length === 0) {
    const baselineClassification = mode === 'enforce' && candidateTriggers.length > 0
      ? `; ${candidateTriggers.length} candidate(s) explicitly classified under the current ${DESIGN_AUTHORITY_PATH} baseline by ${STYLE_AUTHORITY_MODE_ENV}=enforce`
      : '';
    return {
      baselineCandidates: mode === 'enforce' ? candidateTriggers : [],
      changedFiles,
      status: 0,
      stderr: '',
      stdout: `[${GUARD_NAME}] OK: scanned ${changedFiles.length} changed files${baselineClassification}; no design-evolution trigger found.\n`,
      supportingAuthorityUpdates,
      triggers,
    };
  }

  const hasDesignAuthorityUpdate = changedFiles.some((file) => file === DESIGN_AUTHORITY_PATH);
  if (!hasDesignAuthorityUpdate) {
    const stderrLines = [
      `[${GUARD_NAME}] Design evolution requires ${DESIGN_AUTHORITY_PATH} in the same change set.`,
      '',
      'Evolution triggers:',
    ];
    for (const trigger of triggers) {
      stderrLines.push(`- ${trigger.file}: ${trigger.reason}`);
    }
    stderrLines.push('', 'Authority updates detected:');
    if (supportingAuthorityUpdates.length === 0) {
      stderrLines.push('- none');
    } else {
      for (const file of supportingAuthorityUpdates) {
        stderrLines.push(`- ${file}`);
      }
    }
    stderrLines.push(
      '',
      `Update ${DESIGN_AUTHORITY_PATH} plus affected tokens/component contracts, or reclassify the task as non-evolution before running frontend delivery gates.`,
    );

    return {
      baselineCandidates: mode === 'enforce' ? candidateTriggers : [],
      changedFiles,
      status: 1,
      stderr: `${stderrLines.join('\n')}\n`,
      stdout: '',
      supportingAuthorityUpdates,
      triggers,
    };
  }

  return {
    baselineCandidates: mode === 'enforce' ? candidateTriggers : [],
    changedFiles,
    status: 0,
    stderr: '',
    stdout: `[${GUARD_NAME}] OK: ${[
      `${triggers.length} design-evolution trigger(s) covered by ${DESIGN_AUTHORITY_PATH}`,
      supportingAuthorityUpdates.length
        ? `supporting authority updates: ${supportingAuthorityUpdates.join(', ')}`
        : 'supporting authority updates: none',
    ].join('; ')}\n`,
    supportingAuthorityUpdates,
    triggers,
  };
}
