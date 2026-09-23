import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BACKEND_GATE_NAMES,
  buildQualityGateRegistry,
  validateQualityGateRegistry,
  QUALITY_ENTRYPOINT_SCRIPTS,
  QUALITY_RUNNER_SLICE_GATES,
  VIRTUAL_QUALITY_PACKAGE_SCRIPTS,
} from '../quality/quality-gate-registry.mjs';
import {
  VERIFY_CI_META_GATES,
} from './verify-ci-meta-gates.mjs';
import {
  checkQualityWorkflowCacheContract,
  readQualityWorkflowSource,
} from './quality-workflow-contract-core.mjs';

export const PACKAGE_WIRING_GUARD_NAME = 'verify-ci-package-wiring';
export const PACKAGE_WIRING_BEHAVIOR_GUARD_NAME = 'verify-ci-package-wiring-behavior';

export const REQUIRED_ESLINT_IGNORES = Object.freeze([
  '.cache/**',
]);

export {
  QUALITY_WORKFLOW_PATH,
  REQUIRED_QUALITY_WORKFLOW_CACHE_PATHS,
  REQUIRED_QUALITY_WORKFLOW_REMOTE_CACHE_ENV,
} from './quality-workflow-contract-core.mjs';

export const REQUIRED_FULL_LINT_SCRIPT = 'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts apps/web-vite/vitest.coverage.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts docker/content-production/renderer --cache --cache-location .cache/eslint/full/ --cache-strategy content';
export const LINTABLE_SOURCE_FILE_EXTENSIONS = Object.freeze(['cjs', 'js', 'jsx', 'mjs', 'ts', 'tsx']);
export const LINTABLE_SOURCE_FILE_PATTERN = new RegExp(`\\.(?:${LINTABLE_SOURCE_FILE_EXTENSIONS.join('|')})$`, 'u');
export const FULL_LINT_SURFACE_PATTERNS = Object.freeze([
  /^\.pi\/extensions\/trellis\/index\.ts$/u,
  /^apps\/web-vite\/src\//u,
  /^apps\/web-vite\/vite\.config\.ts$/u,
  /^apps\/web-vite\/vitest\.config\.ts$/u,
  /^apps\/web-vite\/vitest\.coverage\.config\.ts$/u,
  /^backend-rust\/scripts\//u,
  /^scripts\//u,
  /^docker\/content-production\/renderer\//u,
  /^tailwind\.config\.ts$/u,
  /^eslint\.config\.mjs$/u,
  /^postcss\.config\.js$/u,
]);

export function listTrackedLintableSourceFiles(repoRoot, options = {}) {
  const {
    fileExists = existsSync,
    gitRunner = execFileSync,
  } = options;
  const pathspecs = LINTABLE_SOURCE_FILE_EXTENSIONS.map((extension) => `*.${extension}`);
  const output = gitRunner('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...pathspecs], {
    cwd: repoRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((file) => fileExists(join(repoRoot, file)))
    .filter((file) => LINTABLE_SOURCE_FILE_PATTERN.test(file));
}

export function isCoveredByFullLintSurface(file) {
  return FULL_LINT_SURFACE_PATTERNS.some((pattern) => pattern.test(file));
}

export function checkPackageWiring(options = {}) {
  const {
    eslintConfigText,
    packageJson,
    repoRoot = process.cwd(),
    registry = buildQualityGateRegistry({ packageJson, repoRoot }),
    trackedJavascriptFiles,
    qualityWorkflowText,
  } = options;
  const scripts = packageJson.scripts ?? {};
  const findings = validateQualityGateRegistry(registry, { packageJson, repoRoot });
  const virtualScripts = new Set(Object.keys(VIRTUAL_QUALITY_PACKAGE_SCRIPTS));

  for (const [scriptName, expectedCommand] of Object.entries(QUALITY_ENTRYPOINT_SCRIPTS)) {
    if (scripts[scriptName] !== expectedCommand) {
      findings.push(`${scriptName} must point at quality-runner; expected ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(scripts[scriptName])}`);
    }
  }

  if (scripts.lint !== REQUIRED_FULL_LINT_SCRIPT) {
    findings.push(`lint package script drifted; expected ${JSON.stringify(REQUIRED_FULL_LINT_SCRIPT)}, got ${JSON.stringify(scripts.lint)}`);
  }

  for (const metaGate of VERIFY_CI_META_GATES) {
    const gate = registry.byName.get(metaGate.name);
    if (!gate) {
      findings.push(`${metaGate.name} is missing from quality gate registry`);
      continue;
    }
    if (gate.command !== metaGate.command) {
      findings.push(`${metaGate.name} command drifted; expected ${JSON.stringify(metaGate.command)}, got ${JSON.stringify(gate.command)}`);
    }
  }

  for (const gate of registry.gates) {
    if (!gate.command) {
      continue;
    }
    if (Object.hasOwn(VIRTUAL_QUALITY_PACKAGE_SCRIPTS, gate.name)) {
      continue;
    }
    if (scripts[gate.name] === undefined && gate.command !== undefined) {
      findings.push(`${gate.name} package script is missing; registry command fallback is ${JSON.stringify(gate.command)}`);
    }
  }

  for (const scriptName of virtualScripts) {
    if (
      scripts[scriptName] !== undefined
      && scripts[scriptName] !== VIRTUAL_QUALITY_PACKAGE_SCRIPTS[scriptName]
    ) {
      const kind = scriptName === 'verify:quality-runner:cache' || scriptName === 'verify:quality-runner:affected'
        ? 'virtual compatibility quality-runner slice'
        : 'virtual quality-runner slice';
      findings.push(`${scriptName} is a ${kind}; keep it in scripts/lib/quality/quality-runner-slices.mjs instead of package.json`);
    }
  }

  const ciNames = new Set(registry.ciGateNames);
  for (const required of ['lint', 'lint:scripts', 'build', 'verify:frontend:bundle-budget', 'type-check', 'verify:deploy:config-behavior', 'verify:deploy:config', ...BACKEND_GATE_NAMES, 'verify:shell:syntax', 'verify:frontend:preflight', ...QUALITY_RUNNER_SLICE_GATES]) {
    if (!ciNames.has(required)) {
      findings.push(`quality ci mode is missing required gate: ${required}`);
    }
  }

  const effectiveEslintConfigText = eslintConfigText ?? readFileSync(join(repoRoot, 'eslint.config.mjs'), 'utf8');
  for (const requiredIgnore of REQUIRED_ESLINT_IGNORES) {
    const escaped = requiredIgnore.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (!new RegExp(`['"]${escaped}['"]`, 'u').test(effectiveEslintConfigText)) {
      findings.push(`eslint.config.mjs must ignore ${requiredIgnore} so full lint does not traverse generated quality artifacts`);
    }
  }
  const effectiveQualityWorkflowText = qualityWorkflowText ?? readQualityWorkflowSource(repoRoot);
  findings.push(...checkQualityWorkflowCacheContract(effectiveQualityWorkflowText));
  const uncoveredSourceFiles = (trackedJavascriptFiles ?? listTrackedLintableSourceFiles(repoRoot))
    .filter((file) => LINTABLE_SOURCE_FILE_PATTERN.test(file))
    .filter((file) => !isCoveredByFullLintSurface(file));
  if (uncoveredSourceFiles.length > 0) {
    const preview = uncoveredSourceFiles.slice(0, 10).join(', ');
    const suffix = uncoveredSourceFiles.length > 10 ? `, ... +${uncoveredSourceFiles.length - 10} more` : '';
    findings.push(`lint package script explicit surface misses tracked source files: ${preview}${suffix}`);
  }

  return {
    findings,
    registry,
  };
}

export function formatPackageWiringFailure(findings) {
  return [
    `[${PACKAGE_WIRING_GUARD_NAME}] quality gate registry wiring drift was detected:`,
    ...findings.map((finding) => `- ${finding}`),
    '',
    'Keep package entry scripts, quality gate registry, and meta gates synchronized.',
  ].join('\n');
}
