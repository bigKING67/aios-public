import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const TRELLIS_ARCHIVE_ROOT = '.trellis/tasks/archive';
export const TRELLIS_ARCHIVE_MANIFEST_SCHEMA = 'aios.trellis-archive-manifest.v1';
export const TRELLIS_ARCHIVE_NORMALIZED_MTIME = '2000-01-01T00:00:00.000Z';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const FIXED_TIMESTAMP = new Date(TRELLIS_ARCHIVE_NORMALIZED_MTIME);

function toPosix(value) {
  return String(value).replace(/\\/gu, '/');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256Buffer(content) {
  return createHash('sha256').update(content).digest('hex');
}

function parseIsoDate(value, label) {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return date;
}

function previousIsoDate(value) {
  const date = parseIsoDate(value, 'cutoff');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function assertSafeRelativePath(file) {
  const normalized = toPosix(file);
  const parts = normalized.split('/');
  if (
    normalized.length === 0
    || normalized.startsWith('/')
    || normalized.includes('\0')
    || normalized.includes('\n')
    || parts.some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`unsafe archive path: ${file}`);
  }
  return normalized;
}

function readTaskJson(taskDir) {
  const taskFile = path.join(taskDir, 'task.json');
  if (!existsSync(taskFile) || !lstatSync(taskFile).isFile()) {
    throw new Error(`${toPosix(taskFile)} is missing.`);
  }
  try {
    return JSON.parse(readFileSync(taskFile, 'utf8'));
  } catch (error) {
    throw new Error(`${toPosix(taskFile)} is invalid JSON: ${error.message}`);
  }
}

function childDirectories(parentDir) {
  return readdirSync(parentDir, { withFileTypes: true })
    .map((entry) => {
      const absolutePath = path.join(parentDir, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`archive inventory may not contain symlink directories: ${toPosix(absolutePath)}`);
      }
      return entry.isDirectory() ? absolutePath : null;
    })
    .filter(Boolean)
    .sort(compareText);
}

function listTrackedFiles(repoRoot, taskDirs) {
  if (taskDirs.length === 0) return [];
  const status = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...taskDirs],
    { cwd: repoRoot, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (status.length > 0) {
    throw new Error('eligible Trellis archive sources must be tracked and clean before export.');
  }
  return execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--', ...taskDirs],
    { cwd: repoRoot, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] },
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(assertSafeRelativePath)
    .sort(compareText);
}

function isWithinTaskDir(file, taskDir) {
  return file === taskDir || file.startsWith(`${taskDir}/`);
}

function sourceEntries(repoRoot, taskDirs, trackedFiles) {
  const files = trackedFiles
    .filter((file) => taskDirs.some((taskDir) => isWithinTaskDir(file, taskDir)))
    .sort(compareText);
  if (files.length === 0) {
    throw new Error('eligible Trellis archive sources contain no tracked files.');
  }

  return files.map((file) => {
    const absolutePath = path.join(repoRoot, file);
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(`archive source must be a regular file: ${file}`);
    }
    const content = readFileSync(absolutePath);
    return {
      bytes: content.length,
      file,
      mode: stat.mode & 0o777,
      sha256: sha256Buffer(content),
    };
  });
}

function sourceTreeSha256(entries) {
  const hash = createHash('sha256');
  for (const entry of entries) {
    hash.update(entry.file);
    hash.update('\0');
    hash.update(entry.mode.toString(8));
    hash.update('\0');
    hash.update(String(entry.bytes));
    hash.update('\0');
    hash.update(entry.sha256);
    hash.update('\n');
  }
  return hash.digest('hex');
}

function archivePaths(entries) {
  const paths = new Set();
  for (const entry of entries) {
    let current = path.posix.dirname(entry.file);
    while (current !== '.') {
      paths.add(assertSafeRelativePath(current));
      current = path.posix.dirname(current);
    }
    paths.add(entry.file);
  }
  return [...paths].sort(compareText);
}

function prepareStagingTree(repoRoot, stagingRoot, entries) {
  const directories = new Set();
  for (const entry of entries) {
    const destination = path.join(stagingRoot, entry.file);
    const parent = path.dirname(destination);
    mkdirSync(parent, { recursive: true, mode: 0o755 });
    copyFileSync(path.join(repoRoot, entry.file), destination);
    chmodSync(destination, entry.mode);
    utimesSync(destination, FIXED_TIMESTAMP, FIXED_TIMESTAMP);

    let current = parent;
    while (current !== stagingRoot && current.startsWith(`${stagingRoot}${path.sep}`)) {
      directories.add(current);
      current = path.dirname(current);
    }
  }
  for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
    chmodSync(directory, 0o755);
    utimesSync(directory, FIXED_TIMESTAMP, FIXED_TIMESTAMP);
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw new Error(`${command} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`${command} exited ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function buildArchiveBytes(repoRoot, entries) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'aios-trellis-archive-pass-'));
  try {
    const stagingRoot = path.join(tempRoot, 'stage');
    const tarPath = path.join(tempRoot, 'payload.tar');
    const archivePath = path.join(tempRoot, 'payload.tar.zst');
    const pathList = path.join(tempRoot, 'paths.bin');
    mkdirSync(stagingRoot, { recursive: true });
    prepareStagingTree(repoRoot, stagingRoot, entries);
    writeFileSync(
      pathList,
      Buffer.concat(archivePaths(entries).map((file) => Buffer.from(`${file}\0`, 'utf8'))),
    );
    runCommand('tar', [
      '-c',
      '-f', tarPath,
      '--format', 'ustar',
      '--no-recursion',
      '--uid', '0',
      '--gid', '0',
      '--uname', 'root',
      '--gname', 'root',
      '--no-acls',
      '--no-fflags',
      '--no-mac-metadata',
      '--no-xattrs',
      '--null',
      '-T', pathList,
    ], { cwd: stagingRoot });
    runCommand('zstd', ['-q', '-19', '-T1', '--no-progress', '-f', tarPath, '-o', archivePath]);
    return readFileSync(archivePath);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
}

function walkRegularFiles(rootDir, currentDir = rootDir, collected = []) {
  for (const entry of readdirSync(currentDir, { withFileTypes: true }).sort((left, right) => compareText(left.name, right.name))) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`restored archive contains a symlink: ${toPosix(path.relative(rootDir, absolutePath))}`);
    }
    if (entry.isDirectory()) {
      walkRegularFiles(rootDir, absolutePath, collected);
    } else if (entry.isFile()) {
      collected.push(toPosix(path.relative(rootDir, absolutePath)));
    } else {
      throw new Error(`restored archive contains an unsupported entry: ${toPosix(path.relative(rootDir, absolutePath))}`);
    }
  }
  return collected;
}

function verifyArchiveRestore(archiveBytes, entries) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'aios-trellis-archive-restore-'));
  try {
    const archivePath = path.join(tempRoot, 'payload.tar.zst');
    const tarPath = path.join(tempRoot, 'payload.tar');
    const restoreRoot = path.join(tempRoot, 'restore');
    mkdirSync(restoreRoot, { recursive: true });
    writeFileSync(archivePath, archiveBytes);
    runCommand('zstd', ['-q', '-d', '-f', archivePath, '-o', tarPath]);
    runCommand('tar', ['-x', '-f', tarPath, '-C', restoreRoot, '--no-same-owner']);

    const restoredFiles = walkRegularFiles(restoreRoot).sort(compareText);
    const expectedFiles = entries.map(({ file }) => file).sort(compareText);
    if (JSON.stringify(restoredFiles) !== JSON.stringify(expectedFiles)) {
      throw new Error('restored archive path inventory does not match the source manifest.');
    }
    for (const entry of entries) {
      const content = readFileSync(path.join(restoreRoot, entry.file));
      if (content.length !== entry.bytes || sha256Buffer(content) !== entry.sha256) {
        throw new Error(`restored archive content mismatch: ${entry.file}`);
      }
    }
    return { fileCount: restoredFiles.length, verified: true };
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
}

export function collectTrellisArchiveInventory(repoRoot, { cutoffExclusive }) {
  const cutoff = parseIsoDate(cutoffExclusive, '--cutoff-exclusive');
  const archiveRoot = path.join(repoRoot, TRELLIS_ARCHIVE_ROOT);
  if (!existsSync(archiveRoot) || !lstatSync(archiveRoot).isDirectory()) {
    throw new Error(`${TRELLIS_ARCHIVE_ROOT} is missing.`);
  }

  const tasks = [];
  for (const monthDir of childDirectories(archiveRoot)) {
    for (const taskDir of childDirectories(monthDir)) {
      const task = readTaskJson(taskDir);
      const completedAt = task.completedAt ?? task.completed_at;
      if (task.status !== 'completed') {
        throw new Error(`${toPosix(path.relative(repoRoot, taskDir))} must have status=completed.`);
      }
      const completedDate = parseIsoDate(completedAt, `${task.id ?? path.basename(taskDir)} completedAt`);
      tasks.push({
        completedAt,
        eligible: completedDate.getTime() < cutoff.getTime(),
        id: String(task.id ?? path.basename(taskDir)),
        path: toPosix(path.relative(repoRoot, taskDir)),
      });
    }
  }
  tasks.sort((left, right) => compareText(left.path, right.path));
  return {
    cutoffExclusive,
    eligibleTasks: tasks.filter(({ eligible }) => eligible),
    inspectedTaskCount: tasks.length,
    tasks,
  };
}

export function buildTrellisArchiveSourceManifest(repoRoot, tasks, options = {}) {
  const taskDirs = tasks.map((task) => task.path).sort(compareText);
  const trackedFiles = options.trackedFiles ?? listTrackedFiles(repoRoot, taskDirs);
  const entries = sourceEntries(repoRoot, taskDirs, trackedFiles);
  return {
    entries,
    fileCount: entries.length,
    sourceBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    sourceTreeSha256: sourceTreeSha256(entries),
    taskCount: tasks.length,
    taskDirs,
  };
}

export function resolveTrellisArchiveOutputDir(repoRoot, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  const resolvedRepoRoot = path.resolve(repoRoot);
  if (
    resolvedOutputDir === resolvedRepoRoot
    || resolvedOutputDir.startsWith(`${resolvedRepoRoot}${path.sep}`)
  ) {
    throw new Error('--output-dir must stay outside the repository.');
  }
  return resolvedOutputDir;
}

export function exportTrellisArchive(repoRoot, { cutoffExclusive, outputDir }) {
  const resolvedOutputDir = resolveTrellisArchiveOutputDir(repoRoot, outputDir);
  const inventory = collectTrellisArchiveInventory(repoRoot, { cutoffExclusive });
  if (inventory.eligibleTasks.length === 0) {
    throw new Error(`no completed Trellis archives are older than ${cutoffExclusive}.`);
  }
  const source = buildTrellisArchiveSourceManifest(repoRoot, inventory.eligibleTasks);
  const firstArchive = buildArchiveBytes(repoRoot, source.entries);
  const secondArchive = buildArchiveBytes(repoRoot, source.entries);
  const archiveSha256 = sha256Buffer(firstArchive);
  if (archiveSha256 !== sha256Buffer(secondArchive) || !firstArchive.equals(secondArchive)) {
    throw new Error('deterministic archive verification failed: repeated exports differ.');
  }
  const restore = verifyArchiveRestore(firstArchive, source.entries);

  const includedThrough = previousIsoDate(cutoffExclusive);
  const artifactBase = `aios-trellis-archive-through-${includedThrough}`;
  mkdirSync(resolvedOutputDir, { recursive: true });
  const archivePath = path.join(resolvedOutputDir, `${artifactBase}.tar.zst`);
  const manifestPath = path.join(resolvedOutputDir, `${artifactBase}.manifest.json`);
  const manifest = {
    schema: TRELLIS_ARCHIVE_MANIFEST_SCHEMA,
    archiveRoot: TRELLIS_ARCHIVE_ROOT,
    cutoffExclusive,
    includedThrough,
    normalization: {
      compression: 'zstd-19-t1',
      gid: 0,
      gname: 'root',
      mtime: TRELLIS_ARCHIVE_NORMALIZED_MTIME,
      pathOrder: 'bytewise-ascending',
      tarFormat: 'ustar',
      uid: 0,
      uname: 'root',
    },
    taskCount: source.taskCount,
    fileCount: source.fileCount,
    sourceBytes: source.sourceBytes,
    sourceTreeSha256: source.sourceTreeSha256,
    archiveFile: path.basename(archivePath),
    archiveBytes: firstArchive.length,
    archiveSha256,
    deterministicReplayVerified: true,
    localRestoreVerified: restore.verified,
    restoredFileCount: restore.fileCount,
    tasks: inventory.eligibleTasks.map(({ completedAt, id, path: taskPath }) => ({
      completedAt,
      id,
      path: taskPath,
    })),
    entries: source.entries,
  };
  writeFileSync(archivePath, firstArchive);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { archivePath, inventory, manifest, manifestPath };
}

export function parseTrellisArchiveExportArgs(args) {
  const options = {
    cutoffExclusive: null,
    help: false,
    outputDir: path.join(tmpdir(), 'aios-trellis-archive-export'),
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--cutoff-exclusive') {
      index += 1;
      if (index >= args.length) throw new Error('--cutoff-exclusive requires a value.');
      options.cutoffExclusive = args[index];
    } else if (arg.startsWith('--cutoff-exclusive=')) {
      options.cutoffExclusive = arg.slice('--cutoff-exclusive='.length);
    } else if (arg === '--output-dir') {
      index += 1;
      if (index >= args.length) throw new Error('--output-dir requires a value.');
      options.outputDir = args[index];
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!options.help) {
    if (!options.cutoffExclusive) throw new Error('--cutoff-exclusive is required.');
    parseIsoDate(options.cutoffExclusive, '--cutoff-exclusive');
    if (!String(options.outputDir).trim()) throw new Error('--output-dir may not be empty.');
  }
  return options;
}

export function summarizeTrellisArchiveExport(result) {
  return [
    `[trellis-archive-export] OK: tasks=${result.manifest.taskCount} files=${result.manifest.fileCount} sourceBytes=${result.manifest.sourceBytes} archiveBytes=${result.manifest.archiveBytes}`,
    `[trellis-archive-export] sha256=${result.manifest.archiveSha256} deterministicReplay=true localRestore=true`,
    `[trellis-archive-export] archive=${toPosix(result.archivePath)}`,
    `[trellis-archive-export] manifest=${toPosix(result.manifestPath)}`,
    '[trellis-archive-export] source deletion remains blocked until authorized release upload, remote re-download, and digest/restore parity.',
  ].join('\n');
}
