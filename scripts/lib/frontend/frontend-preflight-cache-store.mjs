import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const CACHE_SCHEMA_VERSION = 2;
export const CACHE_DIR = '.cache/aios-quality/frontend-preflight';

export function readCacheHit(cacheFile, cacheKey) {
  if (!existsSync(cacheFile)) {
    return false;
  }
  try {
    const payload = JSON.parse(readFileSync(cacheFile, 'utf8'));
    return payload?.schema === CACHE_SCHEMA_VERSION
      && payload?.cacheKey === cacheKey
      && payload?.status === 'pass';
  } catch {
    return false;
  }
}

export function writeCachePass(cacheFile, cacheKey) {
  if (!cacheFile || !cacheKey) {
    throw new Error('write requires --cache-file and --cache-key');
  }
  mkdirSync(path.dirname(cacheFile), { recursive: true });
  const tmpFile = `${cacheFile}.${process.pid}.tmp`;
  writeFileSync(
    tmpFile,
    `${JSON.stringify({
      cacheKey,
      schema: CACHE_SCHEMA_VERSION,
      status: 'pass',
      timestamp: new Date().toISOString(),
    }, null, 2)}\n`,
    'utf8',
  );
  renameSync(tmpFile, cacheFile);
}
