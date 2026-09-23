import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function fileDigest(filePath) {
  return `sha256:${sha256(readFileSync(filePath))}`;
}

function fileMode(filePath) {
  try {
    return (statSync(filePath).mode & 0o777).toString(8);
  } catch {
    return '<missing>';
  }
}

export function parseManifest(manifestPath) {
  return readFileSync(manifestPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64})\s+([ *]?)(.+)$/i);
      if (!match) {
        throw new Error(`invalid manifest line: ${line}`);
      }
      const relativePath = match[3].replace(/^\.\//, '');
      return {
        digest: match[1].toLowerCase(),
        relativePath,
        raw: line,
      };
    });
}

export function resolveManifestEntryPath(vendorDir, relativePath) {
  const fullPath = path.resolve(vendorDir, relativePath);
  const relativeToVendor = path.relative(vendorDir, fullPath);
  if (relativeToVendor.startsWith('..') || path.isAbsolute(relativeToVendor)) {
    throw new Error(`manifest entry escapes vendor dir: ${relativePath}`);
  }
  return fullPath;
}

export function readManifestSnapshot(manifestPath, vendorDir) {
  const entries = parseManifest(manifestPath);
  return {
    digest: fileDigest(manifestPath),
    entries: entries.map((entry) => {
      const fullPath = resolveManifestEntryPath(vendorDir, entry.relativePath);
      let actualDigest;
      try {
        actualDigest = sha256(readFileSync(fullPath));
      } catch {
        throw new Error(`manifest entry missing: ${entry.relativePath}`);
      }
      if (actualDigest !== entry.digest) {
        throw new Error(`manifest digest mismatch: ${entry.relativePath} expected sha256:${entry.digest} actual sha256:${actualDigest}`);
      }
      return {
        ...entry,
        actualDigest: `sha256:${actualDigest}`,
        mode: fileMode(fullPath),
      };
    }),
  };
}
