import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

export function writeExecutable(filePath, text) {
  writeText(filePath, text);
  chmodSync(filePath, 0o755);
}

export function linkExecutable(filePath, targetPath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  symlinkSync(targetPath, filePath);
}

export function copyText(sourceRepoRoot, repoRoot, relativePath) {
  writeText(
    path.join(repoRoot, relativePath),
    readFileSync(path.join(sourceRepoRoot, relativePath), 'utf8'),
  );
}

export function createSchedulerTempWorkspace() {
  return mkdtempSync(path.join(tmpdir(), 'aios-quality-runner-scheduler-'));
}

export function removeSchedulerTempWorkspace(repoRoot) {
  rmSync(repoRoot, { force: true, recursive: true });
}
