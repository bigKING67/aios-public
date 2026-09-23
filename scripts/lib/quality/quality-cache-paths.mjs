import path from 'node:path';

export const CACHE_ROOT = '.cache/aios-quality';
export const DIGEST_CACHE_DIR = 'digests';
export const RESULT_CACHE_DIR = 'results';
export const ARTIFACT_CACHE_DIR = 'artifacts';

export function getQualityCacheRoot(repoRoot) {
  return path.join(repoRoot, CACHE_ROOT);
}

export function safeCacheSegment(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/g, '_');
}
