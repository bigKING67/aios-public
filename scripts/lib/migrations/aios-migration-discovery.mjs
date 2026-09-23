import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

function detectExecutionMode({ content, nonTransactional, relativePath }) {
  const hasBegin = /^\s*BEGIN\s*;/im.test(content);
  const hasCommit = /^\s*COMMIT\s*;/im.test(content);
  if (hasBegin !== hasCommit) {
    throw new Error(`${relativePath}: explicit transaction must contain both BEGIN and COMMIT.`);
  }
  if (nonTransactional && hasBegin) {
    throw new Error(`${relativePath}: nontransactional migration cannot contain BEGIN/COMMIT.`);
  }
  if (/\bCONCURRENTLY\b/i.test(content) && !nonTransactional) {
    throw new Error(`${relativePath}: CONCURRENTLY requires an explicit nonTransactionalVersions descriptor entry.`);
  }
  if (nonTransactional) return 'nontransactional';
  if (hasBegin) return 'self-transactional';
  return 'transactional';
}

export function discoverAiosMigrations({
  descriptor,
  readDirectory = readdirSync,
  readFile = readFileSync,
} = {}) {
  const records = [];
  for (const namespace of Object.keys(descriptor.namespaces).sort()) {
    const config = descriptor.namespaces[namespace];
    const versionPattern = new RegExp(config.versionPattern);
    const seenVersions = new Set();
    const files = readDirectory(config.directory).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const match = versionPattern.exec(file);
      if (!match?.[1]) throw new Error(`${namespace}: invalid migration filename ${file}.`);
      const version = match[1];
      if (seenVersions.has(version)) throw new Error(`${namespace}: duplicate migration version ${version}.`);
      seenVersions.add(version);
      const relativePath = path.posix.join(config.directory.replace(/\\/g, '/'), file);
      const content = readFile(relativePath);
      const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
      records.push({
        namespace,
        version,
        file,
        relativePath,
        checksum: checksum(bytes),
        sizeBytes: bytes.length,
        executionMode: detectExecutionMode({
          content: bytes.toString('utf8'),
          nonTransactional: config.nonTransactionalVersions.includes(version),
          relativePath,
        }),
      });
    }
    for (const version of config.nonTransactionalVersions) {
      if (!seenVersions.has(version)) {
        throw new Error(`${namespace}: nontransactional version ${version} does not exist.`);
      }
    }
  }
  return records;
}

export function summarizeAiosMigrations(records) {
  const summary = {};
  for (const record of records) {
    summary[record.namespace] ??= { total: 0, bytes: 0, modes: {} };
    summary[record.namespace].total += 1;
    summary[record.namespace].bytes += record.sizeBytes;
    summary[record.namespace].modes[record.executionMode] =
      (summary[record.namespace].modes[record.executionMode] ?? 0) + 1;
  }
  return summary;
}
