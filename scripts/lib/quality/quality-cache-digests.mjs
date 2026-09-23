import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  DIGEST_CACHE_DIR,
  getQualityCacheRoot,
} from './quality-cache-paths.mjs';

export function hashString(value) {
  return createHash('sha256').update(value).digest('hex');
}

function digestCacheFilePath(repoRoot) {
  return path.join(getQualityCacheRoot(repoRoot), DIGEST_CACHE_DIR, 'files-v1.json');
}

function loadDiskDigestCache(repoRoot, context) {
  if (context.diskDigestCache) {
    return context.diskDigestCache;
  }

  const cacheFile = digestCacheFilePath(repoRoot);
  let entries = {};
  try {
    const payload = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (payload?.schema === 1 && payload.entries && typeof payload.entries === 'object') {
      entries = payload.entries;
    }
  } catch {
    entries = {};
  }

  context.diskDigestCache = {
    cacheFile,
    dirty: false,
    entries,
  };
  return context.diskDigestCache;
}

export function fileDigest(repoRoot, file, context = null) {
  if (context?.fileDigests.has(file)) {
    return context.fileDigests.get(file);
  }

  const fullPath = path.join(repoRoot, file);
  let digest;
  try {
    const stat = statSync(fullPath);
    const diskCache = context ? loadDiskDigestCache(repoRoot, context) : null;
    const cacheKey = `${file}\0${stat.size}\0${Number(stat.mtimeMs)}\0${Number(stat.ctimeMs)}`;
    const cached = diskCache?.entries?.[file];
    if (cached?.cacheKey === cacheKey && cached.digest) {
      digest = cached.digest;
    } else {
      digest = `sha256:${hashString(readFileSync(fullPath))}`;
      if (diskCache) {
        diskCache.entries[file] = { cacheKey, digest };
        diskCache.dirty = true;
      }
    }
  } catch {
    digest = '<missing>';
  }
  context?.fileDigests.set(file, digest);
  return digest;
}

export function flushQualityCacheContext(context) {
  const diskCache = context?.diskDigestCache;
  if (!diskCache?.dirty) {
    return;
  }
  mkdirSync(path.dirname(diskCache.cacheFile), { recursive: true });
  writeFileSync(
    diskCache.cacheFile,
    `${JSON.stringify({
      schema: 1,
      entries: diskCache.entries,
    })}\n`,
    'utf8',
  );
  diskCache.dirty = false;
}
