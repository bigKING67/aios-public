import {
  readRequiredJsonFile,
} from './guard-files.mjs';

export function readCappedCountAllowlistConfig(repoRoot, configPath, fail, options = {}) {
  const { capField, missingMessage = `missing ${configPath}` } = options;
  const config = readRequiredJsonFile(repoRoot, configPath, fail, { missingMessage });
  return {
    config,
    allowlist: buildCappedCountAllowlist(config, configPath, fail, { capField }),
  };
}

export function buildCappedCountAllowlist(config, configPath, fail, options = {}) {
  const { capField } = options;
  if (config.version !== 1) {
    fail(`${configPath} must use version 1`);
  }
  if (!Array.isArray(config.allowed)) {
    fail(`${configPath} allowed must be an array`);
  }

  const allowlist = new Map();
  const duplicatePaths = new Set();
  for (const entry of config.allowed) {
    if (!entry || typeof entry.path !== 'string' || !entry.path) {
      fail(`${configPath} contains an allowlist entry without a path`);
    }
    if (!Number.isInteger(entry[capField]) || entry[capField] <= 0) {
      fail(`${entry.path} ${capField} must be a positive integer`);
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
    fail(`${configPath} contains duplicate path ${Array.from(duplicatePaths).join(', ')}`);
  }

  return allowlist;
}

export function auditCappedCountFiles(files, allowlist, options = {}) {
  const { capField, countFindings, createViolation } = options;
  const fileSet = new Set(files);
  const violations = [];
  const missingAllowlistEntries = [];
  const staleAllowlistEntries = [];
  const reducedAllowlistCaps = [];

  for (const file of allowlist.keys()) {
    if (!fileSet.has(file)) {
      missingAllowlistEntries.push(file);
    }
  }

  for (const file of files) {
    const audit = countFindings(file);
    const count = audit.count;
    const allowedEntry = allowlist.get(file);

    if (!allowedEntry) {
      if (count > 0) {
        violations.push(createViolation({ audit, count, maxCount: 0 }));
      }
      continue;
    }

    if (count === 0) {
      staleAllowlistEntries.push(file);
      continue;
    }

    if (count > allowedEntry[capField]) {
      violations.push(createViolation({ audit, count, maxCount: allowedEntry[capField], allowedEntry }));
      continue;
    }

    if (count < allowedEntry[capField]) {
      reducedAllowlistCaps.push({
        file,
        count,
        maxCount: allowedEntry[capField],
      });
    }
  }

  return {
    missingAllowlistEntries,
    reducedAllowlistCaps,
    staleAllowlistEntries,
    violations,
  };
}

export function reportCappedCountAllowlistMaintenanceFailures(result, options) {
  const {
    configPath,
    guardName,
    missingHeader,
    reducedHeader,
    formatReducedEntry = (entry) => [`- ${entry.file}: current=${entry.count} cap=${entry.maxCount}`],
    reducedFooter = `Lower the corresponding caps in ${configPath} so the frozen budget can only move downward.`,
    staleHeader,
  } = options;
  const { missingAllowlistEntries, reducedAllowlistCaps, staleAllowlistEntries } = result;
  let hasFailures = false;

  if (missingAllowlistEntries.length > 0) {
    hasFailures = true;
    console.error(`[${guardName}] ${missingHeader}`);
    for (const file of missingAllowlistEntries) {
      console.error(`- ${file}`);
    }
    console.error(`\nRemove stale entries from ${configPath}.`);
  }

  if (staleAllowlistEntries.length > 0) {
    if (hasFailures) {
      console.error('');
    }
    hasFailures = true;
    console.error(`[${guardName}] ${staleHeader}`);
    for (const file of staleAllowlistEntries) {
      console.error(`- ${file}`);
    }
    console.error(`\nRemove these entries from ${configPath}.`);
  }

  if (reducedAllowlistCaps.length > 0) {
    if (hasFailures) {
      console.error('');
    }
    hasFailures = true;
    console.error(`[${guardName}] ${reducedHeader}`);
    for (const entry of reducedAllowlistCaps) {
      for (const line of formatReducedEntry(entry)) {
        console.error(line);
      }
    }
    console.error(`\n${reducedFooter}`);
  }

  if (hasFailures) {
    process.exit(1);
  }
}
