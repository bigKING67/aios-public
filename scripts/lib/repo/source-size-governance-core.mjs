import path from 'node:path';

import {
  countFileLines,
  listGitFiles,
  readRequiredJsonFile,
} from '../shared/guard-utils.mjs';

export const SOURCE_SIZE_GOVERNANCE_CONFIG = 'scripts/config/repo/source-size-governance.json';
export const SOURCE_SIZE_GOVERNANCE_GUARD = 'repo-source-size-governance';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function isPathWithinRoot(file, root) {
  return file === root || file.startsWith(`${root}/`);
}

export function filterExcludedSourceSizeFiles(category, files) {
  const excludeRoots = category.excludeRoots ?? [];
  return files.filter((file) => !excludeRoots.some((root) => isPathWithinRoot(file, root)));
}

export function validateSourceSizeGovernanceConfig(config, currentDate = new Date()) {
  const findings = [];
  if (config?.version !== 1) {
    findings.push('config version must be 1');
  }
  if (!Array.isArray(config?.categories) || config.categories.length === 0) {
    findings.push('categories must be a non-empty array');
    return findings;
  }

  const categoryNames = new Set();
  const exceptionPaths = new Set();
  const today = new Date(Date.UTC(
    currentDate.getUTCFullYear(),
    currentDate.getUTCMonth(),
    currentDate.getUTCDate(),
  ));

  for (const category of config.categories) {
    if (!category?.name || categoryNames.has(category.name)) {
      findings.push(`category name must be present and unique: ${category?.name ?? '<missing>'}`);
    }
    categoryNames.add(category?.name);
    if (!Array.isArray(category?.roots) || category.roots.length === 0) {
      findings.push(`${category?.name ?? '<missing>'} roots must be a non-empty array`);
    }
    if (!Array.isArray(category?.extensions) || category.extensions.length === 0) {
      findings.push(`${category?.name ?? '<missing>'} extensions must be a non-empty array`);
    }
    if (category?.excludeRoots !== undefined && !Array.isArray(category.excludeRoots)) {
      findings.push(`${category?.name ?? '<missing>'} excludeRoots must be an array when provided`);
    }
    const excludeRoots = Array.isArray(category?.excludeRoots) ? category.excludeRoots : [];
    const seenExcludeRoots = new Set();
    for (const excludeRoot of excludeRoots) {
      if (typeof excludeRoot !== 'string' || !excludeRoot.trim()) {
        findings.push(`${category?.name ?? '<missing>'} excludeRoots entries must be non-empty strings`);
        continue;
      }
      if (seenExcludeRoots.has(excludeRoot)) {
        findings.push(`${category?.name ?? '<missing>'} excludeRoots must be unique: ${excludeRoot}`);
      }
      seenExcludeRoots.add(excludeRoot);
      if (
        Array.isArray(category.roots)
        && !category.roots.some((root) => isPathWithinRoot(excludeRoot, root))
      ) {
        findings.push(`${category?.name ?? '<missing>'} excluded root ${excludeRoot} is outside category roots`);
      }
    }
    if (!Number.isInteger(category?.maxLines) || category.maxLines <= 0) {
      findings.push(`${category?.name ?? '<missing>'} maxLines must be a positive integer`);
    }
    if (!Array.isArray(category?.allowed)) {
      findings.push(`${category?.name ?? '<missing>'} allowed must be an array`);
      continue;
    }

    for (const entry of category.allowed) {
      const label = entry?.path ?? `${category.name}:<missing-path>`;
      if (!entry?.path || exceptionPaths.has(entry.path)) {
        findings.push(`${label} path must be present and globally unique`);
      }
      exceptionPaths.add(entry?.path);
      if (!Number.isInteger(entry?.maxLines) || entry.maxLines <= category.maxLines) {
        findings.push(`${label} maxLines must be greater than ${category.maxLines}`);
      }
      for (const field of ['owner', 'remediationTask', 'reason']) {
        if (typeof entry?.[field] !== 'string' || !entry[field].trim()) {
          findings.push(`${label} must include ${field}`);
        }
      }
      if (typeof entry?.expiresOn !== 'string' || !ISO_DATE_PATTERN.test(entry.expiresOn)) {
        findings.push(`${label} expiresOn must use YYYY-MM-DD`);
      } else {
        const expiresOn = normalizeDate(entry.expiresOn);
        if (Number.isNaN(expiresOn.getTime()) || expiresOn < today) {
          findings.push(`${label} exception expired on ${entry.expiresOn}`);
        }
      }
      if (
        Array.isArray(category.roots)
        && !category.roots.some((root) => entry?.path === root || entry?.path?.startsWith(`${root}/`))
      ) {
        findings.push(`${label} is outside ${category.name} roots`);
      }
      if (
        Array.isArray(category.extensions)
        && !category.extensions.some((extension) => entry?.path?.endsWith(extension))
      ) {
        findings.push(`${label} does not match ${category.name} extensions`);
      }
      if (excludeRoots.some((root) => isPathWithinRoot(entry?.path ?? '', root))) {
        findings.push(`${label} cannot be both excluded and allowlisted`);
      }
    }
  }
  return findings;
}

export function listSourceSizeGovernanceFiles(repoRoot, category) {
  return listGitFiles(category.roots, {
    cwd: repoRoot,
    filter: (file) => category.extensions.some((extension) => file.endsWith(extension)),
  });
}

export function auditSourceSizeGovernanceCategory({
  category,
  files,
  countLines,
}) {
  const allowed = new Map(category.allowed.map((entry) => [entry.path, entry]));
  const fileSet = new Set(files);
  const findings = [];

  for (const entry of category.allowed) {
    if (!fileSet.has(entry.path)) {
      findings.push(`${entry.path} exception points to a missing or undiscovered file`);
    }
  }

  for (const file of files) {
    const lines = countLines(file);
    const entry = allowed.get(file);
    if (entry && lines <= category.maxLines) {
      findings.push(`${file} exception is stale at ${lines} lines (global max ${category.maxLines})`);
    } else if (entry && lines > entry.maxLines) {
      findings.push(`${file} grew to ${lines} lines above frozen cap ${entry.maxLines}`);
    } else if (!entry && lines > category.maxLines) {
      findings.push(`${file} has ${lines} lines above ${category.name} max ${category.maxLines}`);
    }
  }

  return findings;
}

export function auditSourceSizeGovernance({
  config,
  currentDate = new Date(),
  filesForCategory,
  countLines,
}) {
  const configFindings = validateSourceSizeGovernanceConfig(config, currentDate);
  if (configFindings.length > 0) {
    return { categoryResults: [], configFindings, findings: configFindings };
  }

  const categoryResults = config.categories.map((category) => {
    const files = filterExcludedSourceSizeFiles(category, filesForCategory(category));
    const findings = auditSourceSizeGovernanceCategory({ category, files, countLines });
    return { category, files, findings };
  });
  return {
    categoryResults,
    configFindings: [],
    findings: categoryResults.flatMap((result) => result.findings),
  };
}

export function runSourceSizeGovernanceAudit(repoRoot, currentDate = new Date()) {
  const fail = (message) => {
    throw new Error(message);
  };
  const config = readRequiredJsonFile(repoRoot, SOURCE_SIZE_GOVERNANCE_CONFIG, fail);
  return auditSourceSizeGovernance({
    config,
    currentDate,
    filesForCategory: (category) => listSourceSizeGovernanceFiles(repoRoot, category),
    countLines: (file) => countFileLines(path.join(repoRoot, file)),
  });
}

export function summarizeSourceSizeGovernance(result) {
  const fileCount = result.categoryResults.reduce((total, item) => total + item.files.length, 0);
  const exceptionCount = result.categoryResults.reduce((total, item) => total + item.category.allowed.length, 0);
  return `${fileCount} files across ${result.categoryResults.length} categories; ${exceptionCount} owned, expiry-bounded frozen exceptions.`;
}
