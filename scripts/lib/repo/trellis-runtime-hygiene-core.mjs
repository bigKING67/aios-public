import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_TRELLIS_RUNTIME_RETENTION_DAYS = 30;
export const MAX_TRELLIS_RUNTIME_RETENTION_DAYS = 3650;
export const DEFAULT_TRELLIS_RUNTIME_PREVIEW_COUNT = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const TASK_TEXT_EXTENSIONS = new Set(['.json', '.jsonl', '.md']);

function toPosix(value) {
  return String(value).replace(/\\/gu, '/');
}

function repoRelative(repoRoot, absolutePath) {
  return toPosix(path.relative(repoRoot, absolutePath));
}

function readDirectoryEntries(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function listAllowedRuntimePaths(repoRoot) {
  const paths = [];
  const runtimeDir = path.join(repoRoot, '.trellis/.runtime');

  for (const entry of readDirectoryEntries(runtimeDir)) {
    if (/^update-check-.+\.marker$/u.test(entry.name)) {
      paths.push(path.join(runtimeDir, entry.name));
    }
  }

  const sessionsDir = path.join(runtimeDir, 'sessions');
  for (const entry of readDirectoryEntries(sessionsDir)) {
    if (entry.name.endsWith('.json')) {
      paths.push(path.join(sessionsDir, entry.name));
    }
  }

  const runtimeLogsDir = path.join(repoRoot, '.trellis/workspace/runtime-logs');
  for (const entry of readDirectoryEntries(runtimeLogsDir)) {
    paths.push(path.join(runtimeLogsDir, entry.name));
  }

  return paths.sort((left, right) => left.localeCompare(right));
}

function listActiveTaskArtifactFiles(repoRoot) {
  const tasksDir = path.join(repoRoot, '.trellis/tasks');
  const files = [];
  const stack = [];

  for (const entry of readDirectoryEntries(tasksDir)) {
    if (entry.isDirectory() && entry.name !== 'archive') {
      stack.push(path.join(tasksDir, entry.name));
    }
  }

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readDirectoryEntries(current)) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && TASK_TEXT_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function collectActiveTaskReferences(repoRoot, allowedRelativePaths) {
  const references = new Set();
  for (const file of listActiveTaskArtifactFiles(repoRoot)) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const relativePath of allowedRelativePaths) {
      if (content.includes(relativePath)) {
        references.add(relativePath);
      }
    }
  }
  return references;
}

export function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function collectLiveRuntimeLogStems(repoRoot, allowedPaths, processAlive) {
  const stems = new Set();
  const unreadablePidFiles = new Set();
  const runtimeLogsPrefix = '.trellis/workspace/runtime-logs/';

  for (const absolutePath of allowedPaths) {
    const relativePath = repoRelative(repoRoot, absolutePath);
    if (!relativePath.startsWith(runtimeLogsPrefix) || path.extname(absolutePath) !== '.pid') {
      continue;
    }
    try {
      const stat = fs.lstatSync(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        continue;
      }
      const pid = Number.parseInt(fs.readFileSync(absolutePath, 'utf8').trim(), 10);
      if (processAlive(pid)) {
        stems.add(path.basename(absolutePath, '.pid'));
      }
    } catch {
      unreadablePidFiles.add(relativePath);
    }
  }

  return { stems, unreadablePidFiles };
}

function runtimeLogStem(relativePath) {
  if (!relativePath.startsWith('.trellis/workspace/runtime-logs/')) {
    return null;
  }
  return path.basename(relativePath, path.extname(relativePath));
}

function protectedEntry(file, bytes, reason) {
  return { bytes, file, reason };
}

export function auditTrellisRuntime(repoRoot, options = {}) {
  const retentionDays = options.retentionDays ?? DEFAULT_TRELLIS_RUNTIME_RETENTION_DAYS;
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > MAX_TRELLIS_RUNTIME_RETENTION_DAYS) {
    throw new Error(`retentionDays must be an integer from 1 to ${MAX_TRELLIS_RUNTIME_RETENTION_DAYS}`);
  }

  const nowMs = options.nowMs ?? Date.now();
  const processAlive = options.processAlive ?? isProcessAlive;
  const cutoffMs = nowMs - retentionDays * DAY_MS;
  const allowedPaths = listAllowedRuntimePaths(repoRoot);
  const allowedRelativePaths = allowedPaths.map((absolutePath) => repoRelative(repoRoot, absolutePath));
  const activeReferences = collectActiveTaskReferences(repoRoot, allowedRelativePaths);
  const { stems: liveStems, unreadablePidFiles } = collectLiveRuntimeLogStems(
    repoRoot,
    allowedPaths,
    processAlive,
  );
  const candidates = [];
  const protectedFiles = [];
  const errors = [];
  let scannedBytes = 0;

  for (const absolutePath of allowedPaths) {
    const file = repoRelative(repoRoot, absolutePath);
    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (error) {
      errors.push({ file, reason: error.message });
      continue;
    }

    const bytes = stat.size;
    scannedBytes += bytes;
    if (stat.isSymbolicLink()) {
      protectedFiles.push(protectedEntry(file, bytes, 'symlink'));
      continue;
    }
    if (!stat.isFile()) {
      protectedFiles.push(protectedEntry(file, bytes, 'not-regular-file'));
      continue;
    }
    if (stat.mtimeMs >= cutoffMs) {
      protectedFiles.push(protectedEntry(file, bytes, 'within-retention'));
      continue;
    }
    if (activeReferences.has(file)) {
      protectedFiles.push(protectedEntry(file, bytes, 'active-task-reference'));
      continue;
    }
    if (unreadablePidFiles.has(file)) {
      protectedFiles.push(protectedEntry(file, bytes, 'unreadable-pid'));
      continue;
    }
    const stem = runtimeLogStem(file);
    if (stem && liveStems.has(stem)) {
      protectedFiles.push(protectedEntry(file, bytes, 'live-pid-family'));
      continue;
    }

    candidates.push({
      absolutePath,
      bytes,
      file,
      mtimeMs: stat.mtimeMs,
    });
  }

  const candidateBytes = candidates.reduce((sum, entry) => sum + entry.bytes, 0);
  const protectedBytes = protectedFiles.reduce((sum, entry) => sum + entry.bytes, 0);

  return {
    candidateBytes,
    candidates,
    cutoffMs,
    errors,
    protectedBytes,
    protectedFiles,
    retentionDays,
    scannedBytes,
    scannedCount: candidates.length + protectedFiles.length + errors.length,
  };
}

export function applyTrellisRuntimeCleanup(audit, options = {}) {
  const removeFile = options.removeFile ?? fs.unlinkSync;
  const statFile = options.statFile ?? fs.lstatSync;
  const deleted = [];
  const failures = [];

  for (const candidate of audit.candidates) {
    try {
      const stat = statFile(candidate.absolutePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error('candidate is no longer a regular file');
      }
      if (stat.mtimeMs >= audit.cutoffMs || stat.mtimeMs !== candidate.mtimeMs) {
        throw new Error('candidate changed after audit');
      }
      removeFile(candidate.absolutePath);
      deleted.push(candidate);
    } catch (error) {
      failures.push({
        file: candidate.file,
        reason: error.message,
      });
    }
  }

  return {
    deleted,
    deletedBytes: deleted.reduce((sum, entry) => sum + entry.bytes, 0),
    failures,
  };
}

function previewEntries(entries, previewCount, formatEntry) {
  const preview = entries.slice(0, previewCount).map(formatEntry).join(', ');
  const suffix = entries.length > previewCount ? `, ... +${entries.length - previewCount} more` : '';
  return `${preview}${suffix}`;
}

export function formatTrellisRuntimeReport(audit, options = {}) {
  const applyResult = options.applyResult ?? null;
  const previewCount = options.previewCount ?? DEFAULT_TRELLIS_RUNTIME_PREVIEW_COUNT;
  const mode = applyResult ? 'apply' : 'dry-run';
  const lines = [
    `[trellis-runtime] mode=${mode} retentionDays=${audit.retentionDays} cutoff=${new Date(audit.cutoffMs).toISOString()}`,
    `[trellis-runtime] scanned=${audit.scannedCount} scannedBytes=${audit.scannedBytes} protected=${audit.protectedFiles.length} protectedBytes=${audit.protectedBytes} candidates=${audit.candidates.length} candidateBytes=${audit.candidateBytes} auditErrors=${audit.errors.length}`,
  ];

  if (audit.candidates.length > 0) {
    lines.push(`[trellis-runtime] candidates: ${previewEntries(audit.candidates, previewCount, ({ file, bytes }) => `${file}:${bytes}`)}`);
  }
  if (audit.protectedFiles.length > 0) {
    lines.push(`[trellis-runtime] protected: ${previewEntries(audit.protectedFiles, previewCount, ({ file, reason }) => `${file}(${reason})`)}`);
  }
  if (audit.errors.length > 0) {
    lines.push(`[trellis-runtime] audit-errors: ${previewEntries(audit.errors, previewCount, ({ file, reason }) => `${file}(${reason})`)}`);
  }
  if (applyResult) {
    lines.push(`[trellis-runtime] deleted=${applyResult.deleted.length} deletedBytes=${applyResult.deletedBytes} failed=${applyResult.failures.length}`);
    if (applyResult.failures.length > 0) {
      lines.push(`[trellis-runtime] delete-errors: ${previewEntries(applyResult.failures, previewCount, ({ file, reason }) => `${file}(${reason})`)}`);
    }
  } else {
    lines.push('[trellis-runtime] no files were deleted; pass --apply for the reported candidates only.');
  }

  return lines.join('\n');
}

export function parseTrellisRuntimeArgs(args) {
  const options = {
    apply: false,
    help: false,
    retentionDays: DEFAULT_TRELLIS_RUNTIME_RETENTION_DAYS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--retention-days') {
      index += 1;
      if (index >= args.length) {
        throw new Error('--retention-days requires a value');
      }
      options.retentionDays = Number(args[index]);
      continue;
    }
    if (arg.startsWith('--retention-days=')) {
      options.retentionDays = Number(arg.slice('--retention-days='.length));
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.retentionDays)
    || options.retentionDays < 1
    || options.retentionDays > MAX_TRELLIS_RUNTIME_RETENTION_DAYS) {
    throw new Error(`--retention-days must be an integer from 1 to ${MAX_TRELLIS_RUNTIME_RETENTION_DAYS}`);
  }

  return options;
}
