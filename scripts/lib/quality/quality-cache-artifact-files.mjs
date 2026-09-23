import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  hashString,
} from './quality-cache-digests.mjs';
import {
  normalizeOutputPatterns,
} from './quality-cache-artifact-outputs.mjs';

const ARTIFACT_FILES_DIR = 'files';

function normalizePathForCache(filePath) {
  return normalizeOutputPatterns([filePath])[0] ?? '';
}

export function artifactFilesRoot(artifactRoot) {
  return path.join(artifactRoot, ARTIFACT_FILES_DIR);
}

export function fileContentDigest(filePath) {
  return `sha256:${hashString(readFileSync(filePath))}`;
}

function relativePathFromPattern(pattern) {
  const normalized = normalizePathForCache(pattern);
  const wildcardIndex = normalized.search(/[*?[{]/);
  const rawPath = wildcardIndex === -1 ? normalized : normalized.slice(0, wildcardIndex);
  return rawPath.replace(/\/+$/, '');
}

function artifactOutputRoots(outputs) {
  return [...new Set(outputs
    .map(relativePathFromPattern)
    .filter(Boolean))]
    .sort();
}

function listFilesRecursive(absPath, repoRoot) {
  if (!existsSync(absPath)) {
    return [];
  }

  const stat = statSync(absPath);
  if (stat.isFile()) {
    return [normalizePathForCache(path.relative(repoRoot, absPath))];
  }
  if (!stat.isDirectory()) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(absPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(absPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(entryPath, repoRoot));
    } else if (entry.isFile()) {
      files.push(normalizePathForCache(path.relative(repoRoot, entryPath)));
    }
  }
  return files;
}

export function artifactOutputFiles(repoRoot, outputs) {
  const files = new Set();
  for (const outputRoot of artifactOutputRoots(outputs)) {
    for (const file of listFilesRecursive(path.join(repoRoot, outputRoot), repoRoot)) {
      files.add(file);
    }
  }
  return [...files].sort();
}

export function copyRepoFile(repoRoot, targetRoot, file) {
  const sourcePath = path.join(repoRoot, file);
  const targetPath = path.join(targetRoot, file);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
}

export function copyDirectoryRecursive(sourceRoot, targetRoot) {
  if (!existsSync(sourceRoot)) {
    return false;
  }
  rmSync(targetRoot, { force: true, recursive: true });

  const copyEntry = (sourcePath, targetPath) => {
    const stat = statSync(sourcePath);
    if (stat.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      for (const entry of readdirSync(sourcePath, { withFileTypes: true })) {
        copyEntry(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
      }
      return;
    }
    if (stat.isFile()) {
      mkdirSync(path.dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  };

  copyEntry(sourceRoot, targetRoot);
  return true;
}

export function removeArtifactOutputRoots(repoRoot, outputs) {
  for (const outputRoot of artifactOutputRoots(outputs).sort((left, right) => right.length - left.length)) {
    rmSync(path.join(repoRoot, outputRoot), { force: true, recursive: true });
  }
}
