import {
  baselineGateNamesForMode,
  changedFilesEnvValue,
  defaultAffectedBase,
  listChangedFileEntries,
  selectAffectedGates,
} from './quality-affected.mjs';
import {
  gateNamesForMode,
} from './quality-gate-registry.mjs';
import {
  sortAffectedReasons,
} from './quality-affected-selection-utils.mjs';
import {
  baseForAffectedSelection,
  baseForChangedFileScan,
} from './quality-runner-repo.mjs';

export {
  sortAffectedReasons,
};

export function modeGateNames(mode, registry, repoRoot, options) {
  if (mode === 'affected') {
    const scanBase = baseForChangedFileScan(repoRoot, options);
    const changedFileEntries = listChangedFileEntries(repoRoot, {
      base: scanBase,
      explicitFiles: options.changedFiles,
    });
    const changedFiles = changedFileEntries.map((entry) => entry.file);
    const selectionBase = baseForAffectedSelection(repoRoot, options, changedFiles, scanBase);
    const selection = selectAffectedGates(registry, changedFiles, {
      base: selectionBase,
      head: options.head,
      packageJsonRequiresFullCi: options.packageJsonRequiresFullCi,
      packageLockRequiresFullCi: options.packageLockRequiresFullCi,
      repoRoot,
    });
    return {
      changedFiles,
      changedFileEntries,
      names: selection.names,
      reasons: selection.reasons,
    };
  }
  if (mode === 'prepush') {
    const scanBase = baseForChangedFileScan(repoRoot, options);
    const changedFileEntries = listChangedFileEntries(repoRoot, {
      base: scanBase,
      explicitFiles: options.changedFiles,
    });
    const changedFiles = changedFileEntries.map((entry) => entry.file);
    const selectionBase = baseForAffectedSelection(repoRoot, options, changedFiles, scanBase);
    const affected = selectAffectedGates(registry, changedFiles, {
      base: selectionBase,
      head: options.head,
      packageJsonRequiresFullCi: options.packageJsonRequiresFullCi,
      packageLockRequiresFullCi: options.packageLockRequiresFullCi,
      repoRoot,
    }).names;
    const baseline = baselineGateNamesForMode('prepush');
    return {
      changedFiles,
      changedFileEntries,
      names: [...new Set([...affected, ...baseline])],
      reasons: {},
    };
  }
  return {
    changedFiles: [],
    changedFileEntries: [],
    names: gateNamesForMode(registry, mode),
    reasons: {},
  };
}

function changedFilePath(entry) {
  if (entry && typeof entry === 'object' && typeof entry.file === 'string') {
    return entry.file;
  }
  const text = String(entry ?? '').trim();
  const match = text.match(/^((?:[RC]\d{1,3})|[ MARCDAU?!]{1,2}|\?\?)\s*:\s*(.+)$/);
  return match ? match[2].trim() : text;
}

function uniqueChangedFilePaths(entries = []) {
  return [...new Set(entries.map(changedFilePath).filter(Boolean))];
}

function summarizeChangedFilesForContext(context) {
  const entries = context.changedFileEntries?.length
    ? context.changedFileEntries
    : context.changedFiles ?? [];
  const files = uniqueChangedFilePaths(entries);
  if (files.length === 0) {
    return null;
  }
  const visible = files.slice(0, 8).join(', ');
  return files.length > 8 ? `${visible}, ... +${files.length - 8} more` : visible;
}

function reproduceCommandForGate(gate, result = {}) {
  return gate?.command ?? result.command ?? null;
}

function affectedContextModeLabel(mode) {
  return mode === 'prepush'
    ? 'prepush baseline/dependency/profile selection'
    : 'affected dependency/profile selection';
}

export function formatFailedGateAffectedContext(result, context = {}) {
  const gate = result.gate ?? {};
  const gateName = gate.name ?? 'unknown';
  const lines = [`[why] ${gateName} selected because:`];
  const changedFiles = summarizeChangedFilesForContext(context);
  if (changedFiles) {
    lines.push(`- changed files: ${changedFiles}`);
  }

  const reasons = context.reasons?.[gateName] ?? [];
  const sortedReasons = sortAffectedReasons(reasons);
  if (sortedReasons.length > 0) {
    for (const reason of sortedReasons.slice(0, 8)) {
      lines.push(`- ${reason}`);
    }
    if (sortedReasons.length > 8) {
      lines.push(`- ... +${sortedReasons.length - 8} more reasons`);
    }
  } else {
    lines.push(`- no changed-file reason recorded; likely ${affectedContextModeLabel(context.mode)}`);
  }

  if (gate.group) {
    lines.push(`- group: ${gate.group}`);
  }
  const reproduce = reproduceCommandForGate(gate, result);
  if (reproduce) {
    lines.push(`- reproduce: ${reproduce}`);
  }
  return lines.join('\n');
}

function isShellSyntaxFile(file) {
  return String(file ?? '').endsWith('.sh') || String(file ?? '').startsWith('.githooks/');
}

function shellSyntaxChangedFilesEnvValue(changedFiles = []) {
  return changedFilesEnvValue(changedFiles.filter((entry) => isShellSyntaxFile(changedFilePath(entry))));
}

export function createGateEnv(changedFiles = []) {
  const changedFilesManifest = changedFilesEnvValue(changedFiles);
  const hasChangedFileScope = changedFiles.length > 0;
  return {
    AIOS_QUALITY_BASE: process.env.AIOS_QUALITY_BASE ?? '',
    AIOS_QUALITY_CHANGED_FILES: changedFilesManifest,
    AIOS_QUALITY_HEAD: process.env.AIOS_QUALITY_HEAD ?? '',
    AIOS_SHELL_SYNTAX_CHANGED_FILES: shellSyntaxChangedFilesEnvValue(changedFiles),
    AIOS_SHELL_SYNTAX_CHANGED_SCOPE: hasChangedFileScope ? 'changed' : 'full',
    FRONTEND_DESIGN_EVOLUTION_CHANGED_FILES: changedFilesManifest,
  };
}

export function runHeader(mode, context, options, repoRoot) {
  return {
    base: options.base ?? defaultAffectedBase(repoRoot),
    cache: options.cache,
    changed: context.changedFiles.length,
    gates: context.names.length,
    mode,
    parallel: options.parallel,
  };
}
