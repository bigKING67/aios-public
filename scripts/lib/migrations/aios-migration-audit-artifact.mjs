import { createHash } from 'node:crypto';
import {
  closeSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const MAX_AIOS_MIGRATION_AUDIT_ARTIFACT_BYTES = 20 * 1024 * 1024;

const EXCLUSIVE_JSON_WRITE = Object.freeze({ encoding: 'utf8', flag: 'wx' });

export function resolveExternalMigrationAuditArtifactPath(artifactPath, cwd = process.cwd()) {
  if (!artifactPath) return null;
  if (!path.isAbsolute(artifactPath)) {
    throw new Error('Migration audit artifact path must be absolute and outside the repository.');
  }
  const repositoryRoot = path.resolve(cwd);
  const resolved = path.resolve(artifactPath);
  if (resolved === repositoryRoot || resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error('Migration audit artifact path must be outside the repository.');
  }
  return resolved;
}

export function writeExclusiveMigrationAuditJson(
  value,
  outputPath,
  { cwd = process.cwd(), writeFile = writeFileSync } = {},
) {
  const resolvedPath = resolveExternalMigrationAuditArtifactPath(outputPath, cwd);
  if (!resolvedPath) return null;
  const content = `${JSON.stringify(value, null, 2)}\n`;
  writeFile(resolvedPath, content, EXCLUSIVE_JSON_WRITE);
  return {
    path: resolvedPath,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

export function reserveExclusiveMigrationAuditJson(
  outputPath,
  { cwd = process.cwd(), openFile = openSync } = {},
) {
  const resolvedPath = resolveExternalMigrationAuditArtifactPath(outputPath, cwd);
  if (!resolvedPath) throw new Error('Migration audit output path is required.');
  return {
    descriptor: openFile(resolvedPath, 'wx'),
    path: resolvedPath,
    written: false,
  };
}

export function writeReservedMigrationAuditJson(
  reservation,
  value,
  { closeFile = closeSync, writeFile = writeFileSync } = {},
) {
  if (!reservation?.path || reservation.descriptor == null || reservation.written === true) {
    throw new Error('Migration audit output reservation is invalid or already written.');
  }
  const content = `${JSON.stringify(value, null, 2)}\n`;
  writeFile(reservation.descriptor, content, 'utf8');
  closeFile(reservation.descriptor);
  reservation.written = true;
  return {
    path: reservation.path,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

export function closeMigrationAuditReservation(
  reservation,
  { closeFile = closeSync } = {},
) {
  if (!reservation || reservation.written === true || reservation.descriptor == null) return false;
  closeFile(reservation.descriptor);
  reservation.descriptor = null;
  return true;
}

export function readExternalMigrationAuditJson(
  inputPath,
  {
    cwd = process.cwd(),
    maxBytes = MAX_AIOS_MIGRATION_AUDIT_ARTIFACT_BYTES,
    readFile = readFileSync,
    realpath = realpathSync,
  } = {},
) {
  const resolvedPath = resolveExternalMigrationAuditArtifactPath(inputPath, cwd);
  if (!resolvedPath) throw new Error('Migration audit input path is required.');
  const actualPath = realpath(resolvedPath);
  resolveExternalMigrationAuditArtifactPath(actualPath, cwd);
  const content = readFile(actualPath);
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (bytes.length > maxBytes) {
    throw new Error(`Migration audit artifact exceeds ${maxBytes} bytes.`);
  }
  let data;
  try {
    data = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Migration audit artifact must contain valid JSON.');
  }
  return {
    data,
    metadata: {
      path: actualPath,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
}
