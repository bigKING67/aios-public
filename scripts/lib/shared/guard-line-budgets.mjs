import path from 'node:path';

import {
  countFileLines,
  readRequiredJsonFile,
} from './guard-files.mjs';

export function readLineBudgetConfig(repoRoot, configPath, fail) {
  const config = readRequiredJsonFile(repoRoot, configPath, fail, {
    missingMessage: `missing ${configPath}`,
  });
  if (config.version !== 1) {
    fail(`${configPath} must use version 1`);
  }
  if (!Number.isInteger(config.maxLines) || config.maxLines <= 0) {
    fail(`${configPath} maxLines must be a positive integer`);
  }
  if (!Array.isArray(config.allowed)) {
    fail(`${configPath} allowed must be an array`);
  }

  return config;
}

export function buildLineBudgetAllowlist(config, options) {
  const { configPath, fail, validateEntry = () => {} } = options;
  const allowlist = new Map();
  const duplicatePaths = new Set();

  for (const entry of config.allowed) {
    if (!entry || typeof entry.path !== 'string' || !entry.path) {
      fail(`${configPath} contains an allowlist entry without a path`);
    }
    validateEntry(entry, config);
    if (!Number.isInteger(entry.maxLines) || entry.maxLines <= config.maxLines) {
      fail(`${entry.path} maxLines must be an integer greater than global maxLines (${config.maxLines})`);
    }
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) {
      fail(`${entry.path} must include a reason`);
    }
    if (allowlist.has(entry.path)) {
      duplicatePaths.add(entry.path);
    }
    allowlist.set(entry.path, entry);
  }

  if (duplicatePaths.size > 0) {
    fail(`duplicate allowlist paths: ${Array.from(duplicatePaths).join(', ')}`);
  }

  return allowlist;
}

export function auditLineBudgetFiles(repoRoot, files, config, options) {
  const {
    allowlist,
    countLines = (file) => countFileLines(path.join(repoRoot, file)),
    globalViolationReason,
    allowlistedViolationReason,
  } = options;
  const fileSet = new Set(files);
  const violations = [];
  const staleAllowlistEntries = [];
  const missingAllowlistEntries = [];

  for (const [file, entry] of allowlist.entries()) {
    if (!fileSet.has(file)) {
      missingAllowlistEntries.push(entry);
    }
  }

  for (const file of files) {
    const lines = countLines(file);
    const allowedEntry = allowlist.get(file);

    if (allowedEntry) {
      if (lines > allowedEntry.maxLines) {
        violations.push({
          file,
          lines,
          maxLines: allowedEntry.maxLines,
          reason: allowlistedViolationReason,
        });
      }
      if (lines <= config.maxLines) {
        staleAllowlistEntries.push({ file, lines });
      }
      continue;
    }

    if (lines > config.maxLines) {
      violations.push({
        file,
        lines,
        maxLines: config.maxLines,
        reason: globalViolationReason,
      });
    }
  }

  return {
    missingAllowlistEntries,
    staleAllowlistEntries,
    violations,
  };
}

export function reportLineBudgetFailures(result, options) {
  const {
    configPath,
    guardName,
    missingHeader,
    staleHeader,
    violationHeader,
    violationFooter,
  } = options;
  const { missingAllowlistEntries, staleAllowlistEntries, violations } = result;
  let hasFailures = false;

  if (missingAllowlistEntries.length > 0) {
    hasFailures = true;
    console.error(`[${guardName}] ${missingHeader}`);
    for (const entry of missingAllowlistEntries) {
      console.error(`- ${entry.path}`);
    }
    console.error(`\nRemove stale entries from ${configPath}.`);
  }

  if (staleAllowlistEntries.length > 0) {
    if (hasFailures) {
      console.error('');
    }
    hasFailures = true;
    console.error(`[${guardName}] ${staleHeader}`);
    for (const entry of staleAllowlistEntries) {
      console.error(`- ${entry.file}: ${entry.lines} lines`);
    }
    console.error(`\nRemove these entries from ${configPath}.`);
  }

  if (violations.length > 0) {
    if (hasFailures) {
      console.error('');
    }
    hasFailures = true;
    console.error(`[${guardName}] ${violationHeader}`);
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.lines} lines > ${violation.maxLines}`);
      console.error(`  ${violation.reason}`);
    }
    console.error(`\n${violationFooter}`);
  }

  if (hasFailures) {
    process.exit(1);
  }
}
