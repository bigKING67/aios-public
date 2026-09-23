import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT_MISSING_MESSAGE = 'package.json not found; run from repository root or inside the repo.';

export function getRepoRoot(cwd = process.cwd()) {
  const markerRoot = findRepoRootByMarkers(cwd);
  if (markerRoot) {
    return markerRoot;
  }

  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    const fallbackRoot = path.resolve(cwd);
    const gitDir = resolveGitDir(fallbackRoot);
    if (gitDir) {
      try {
        return execFileSync('git', ['--git-dir', gitDir, '--work-tree', fallbackRoot, 'rev-parse', '--show-toplevel'], {
          cwd: fallbackRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch {
        // Fall through to marker-based discovery.
      }
    }

    return fallbackRoot;
  }
}

function findRepoRootByMarkers(cwd) {
  let current = path.resolve(cwd);
  while (true) {
    if (existsSync(path.join(current, 'package.json')) && existsSync(path.join(current, '.git'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveGitDir(repoRoot) {
  const dotGitPath = path.join(repoRoot, '.git');
  if (!existsSync(dotGitPath)) {
    return null;
  }

  const stat = statSync(dotGitPath);
  if (stat.isDirectory()) {
    return dotGitPath;
  }

  if (!stat.isFile()) {
    return null;
  }

  const match = readFileSync(dotGitPath, 'utf8').trim().match(/^gitdir:\s*(.+)$/i);
  if (!match) {
    return null;
  }

  return path.resolve(repoRoot, match[1]);
}

export function assertRequiredFile(repoRoot, filePath, fail, options = {}) {
  const { missingMessage = `${filePath} not found.` } = options;
  const fullPath = path.join(repoRoot, filePath);
  if (!existsSync(fullPath)) {
    fail(missingMessage);
  }
  return fullPath;
}

export function assertRepoRoot(repoRoot, fail) {
  return assertRequiredFile(repoRoot, 'package.json', fail, {
    missingMessage: REPO_ROOT_MISSING_MESSAGE,
  });
}

export function repoFileExists(repoRoot, filePath) {
  return existsSync(path.join(repoRoot, filePath));
}

export function readTextFile(filePath, options = {}) {
  const { encoding = 'utf8' } = options;
  return readFileSync(filePath, encoding);
}

export function readRepoFile(repoRoot, filePath, options = {}) {
  return readTextFile(path.join(repoRoot, filePath), options);
}

export function readRequiredFile(repoRoot, filePath, fail, options = {}) {
  const { encoding = 'utf8' } = options;
  const fullPath = assertRequiredFile(repoRoot, filePath, fail, options);
  return readTextFile(fullPath, { encoding });
}

export function readRequiredJsonFile(repoRoot, filePath, fail, options = {}) {
  const { encoding = 'utf8' } = options;
  const fullPath = assertRequiredFile(repoRoot, filePath, fail, options);

  try {
    return JSON.parse(readTextFile(fullPath, { encoding }));
  } catch (error) {
    fail(`${filePath} parse failed: ${error.message}`);
  }
}

export function readRequiredPackageJson(repoRoot, fail) {
  return readRequiredJsonFile(repoRoot, 'package.json', fail, {
    missingMessage: REPO_ROOT_MISSING_MESSAGE,
  });
}

export function readFileLines(filePath, options = {}) {
  const { lineEndingPattern = /\r?\n/ } = options;
  return readTextFile(filePath).split(lineEndingPattern);
}

export function readRepoFileLines(repoRoot, filePath, options = {}) {
  return readRepoFile(repoRoot, filePath).split(options.lineEndingPattern ?? /\r?\n/);
}

export function countFileLines(filePath) {
  return readFileLines(filePath).length;
}

export function listGitFiles(pathspecs = [], options = {}) {
  const { cwd = process.cwd(), existing = true, filter = () => true } = options;
  const repoRoot = getRepoRoot(cwd);
  const lsFilesArgs = ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...pathspecs];
  let output;

  try {
    output = execFileSync('git', lsFilesArgs, {
      cwd: repoRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    const gitDir = resolveGitDir(repoRoot);
    if (!gitDir) {
      throw error;
    }

    output = execFileSync('git', ['--git-dir', gitDir, '--work-tree', repoRoot, ...lsFilesArgs], {
      cwd: repoRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  }

  const files = output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((file) => !existing || repoFileExists(repoRoot, file))
    .filter(filter);

  return [...new Set(files)].sort();
}

function walkFiles(dir, predicate, options = {}) {
  const { ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.next']) } = options;
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) {
      continue;
    }
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkFiles(fullPath, predicate, options));
    } else if (predicate(fullPath, entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

export function listCssModuleFiles(repoRoot) {
  try {
    return listGitFiles([':(glob)**/*.module.css'], {
      cwd: repoRoot,
    });
  } catch {
    return walkFiles(repoRoot, (_fullPath, entry) => entry.endsWith('.module.css'))
      .map((file) => path.relative(repoRoot, file))
      .sort();
  }
}
