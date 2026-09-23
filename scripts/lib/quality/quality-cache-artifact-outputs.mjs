import {
  normalizeQualityRepoPath,
} from './quality-repo-scan.mjs';

const ARTIFACT_OUTPUT_DENY_PREFIXES = Object.freeze([
  '.cache/',
  '.git/',
  'apps/web-vite/src/',
  'backend-rust/src/',
  'etl/',
  'node_modules/',
  'scripts/',
  'apps/web-vite/src/',
]);

function normalizePathForCache(filePath) {
  return normalizeQualityRepoPath(filePath);
}

export function normalizeStringList(values) {
  return [...new Set((values ?? [])
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => normalizePathForCache(value.trim())))]
    .sort();
}

export function normalizeOutputPatterns(outputs) {
  return normalizeStringList(outputs);
}

export function validateGateArtifactOutputs(gate) {
  const outputs = normalizeOutputPatterns(gate.outputs);
  const errors = [];

  for (const output of outputs) {
    if (output.startsWith('/') || /^[A-Za-z]:\//.test(output)) {
      errors.push(`${gate.name} output must be repo-relative: ${output}`);
    }
    if (output === '..' || output.startsWith('../') || output.includes('/../')) {
      errors.push(`${gate.name} output must not escape the repository: ${output}`);
    }
    if (output === '.' || output === './' || output === '**') {
      errors.push(`${gate.name} output is too broad: ${output}`);
    }
    for (const prefix of ARTIFACT_OUTPUT_DENY_PREFIXES) {
      if (output === prefix.slice(0, -1) || output.startsWith(prefix)) {
        errors.push(`${gate.name} output must not target source/cache/tooling paths: ${output}`);
        break;
      }
    }
  }

  return {
    errors,
    ok: errors.length === 0,
    outputs,
  };
}
