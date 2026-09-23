#!/usr/bin/env node

import {
  createCheckGuard,
  getRepoRoot,
  readRequiredPackageJson,
} from '../../lib/shared/guard-utils.mjs';
import {
  BACKEND_GATE_NAMES,
  buildQualityGateRegistry,
  gateNamesForMode,
  validateQualityGateRegistry,
} from '../../lib/quality/quality-gate-registry.mjs';
import {
  QUALITY_PROFILE_NAMES,
  QUALITY_PROFILE_PACKAGE_SCRIPTS,
  QUALITY_PROFILE_SCRIPT_NAMES,
  QUALITY_RUNNER_PACKAGE_SCRIPTS,
  QUALITY_RUNNER_VIRTUAL_PACKAGE_SCRIPTS,
} from '../../lib/quality/quality-profiles.mjs';

const GUARD_NAME = 'quality-profiles';
const { fail, reportOk } = createCheckGuard(GUARD_NAME, { errorPrefix: '' });

function assertNoDuplicates(values, sourceName, findings) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      findings.push(`${sourceName} contains duplicate entry: ${value}`);
    }
    seen.add(value);
  }
}

export function checkQualityProfiles(options = {}) {
  const {
    packageJson,
    registry,
  } = options;
  const findings = [];
  const scripts = packageJson?.scripts ?? {};
  const gateRegistry = registry ?? buildQualityGateRegistry({ packageJson });

  findings.push(...validateQualityGateRegistry(gateRegistry, { packageJson }));

  for (const [scriptName, expectedCommand] of Object.entries(QUALITY_PROFILE_PACKAGE_SCRIPTS)) {
    if (scripts[scriptName] !== expectedCommand) {
      findings.push(
        `${scriptName} package script drifted; expected ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(scripts[scriptName])}`,
      );
    }
  }
  for (const [scriptName, expectedCommand] of Object.entries(QUALITY_RUNNER_PACKAGE_SCRIPTS)) {
    if (scripts[scriptName] !== expectedCommand) {
      findings.push(
        `${scriptName} package script drifted; expected ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(scripts[scriptName])}`,
      );
    }
  }
  for (const [scriptName, expectedCommand] of Object.entries(QUALITY_RUNNER_VIRTUAL_PACKAGE_SCRIPTS)) {
    if (scripts[scriptName] !== undefined) {
      if (scripts[scriptName] === expectedCommand) {
        continue;
      }
      const kind = scriptName === 'verify:quality-runner:cache' || scriptName === 'verify:quality-runner:affected'
        ? 'virtual compatibility quality-runner slice'
        : 'virtual quality-runner slice';
      findings.push(`${scriptName} is a ${kind}; keep it out of package.json`);
    }
  }

  const actualProfileNames = [...QUALITY_PROFILE_NAMES].sort();
  assertNoDuplicates(actualProfileNames, 'quality profile registry', findings);

  for (const scriptName of QUALITY_PROFILE_SCRIPT_NAMES) {
    const profileName = scriptName.slice('verify:'.length);
    if (!profileName.startsWith('quality:') && !QUALITY_PROFILE_NAMES.includes(profileName)) {
      findings.push(`${scriptName} points at unknown quality profile: ${profileName}`);
    }
  }

  for (const profileName of QUALITY_PROFILE_NAMES) {
    const names = gateNamesForMode(gateRegistry, profileName);
    if (names.length === 0) {
      findings.push(`quality profile ${profileName} must define at least one gate`);
      continue;
    }
    assertNoDuplicates(names, `quality profile ${profileName}`, findings);
    for (const gateName of names) {
      if (!gateRegistry.byName.has(gateName)) {
        findings.push(`quality profile ${profileName} references missing gate: ${gateName}`);
      }
    }
  }

  const quickNames = gateNamesForMode(gateRegistry, 'quick');
  for (const required of [
    'lint:scripts',
    'type-check',
    'verify:ci:wiring',
    'verify:ci:generated',
    'verify:ci:manifest-order',
    'verify:ci:profiles',
    'verify:quality-runner:entrypoint',
    'verify:quality-runner:registry',
    'verify:quality-runner:affected-mapping',
    'verify:quality-runner:affected-mode',
    'verify:quality-runner:affected-explain',
    'verify:quality-runner:affected-runtime-status',
    'verify:quality-runner:affected-runtime-env',
    'verify:quality-runner:affected-files',
    'verify:quality-runner:cache-stats',
    'verify:quality-runner:cache-key-digest',
    'verify:quality-runner:cache-key-env',
    'verify:quality-runner:cache-key-tool-version',
    'verify:quality-runner:cache-local',
    'verify:quality-runner:cache-artifact',
    'verify:quality-runner:cache-remote-config',
    'verify:quality-runner:cache-remote-result',
    'verify:quality-runner:cache-remote-stats',
    'verify:quality-runner:cache-remote-repair',
    'verify:quality-runner:cache-remote-artifact',
    'verify:quality-runner:manifest',
    'verify:quality-runner:scheduler-env',
    'verify:quality-runner:scheduler-shell',
    'verify:quality-runner:scheduler-local-bin',
    'verify:quality-runner:scheduler-concurrency',
    'verify:quality-runner:scheduler-cache-bypass',
    'verify:quality-runner:hook',
    'verify:quality-runner:preflight-cache-key',
    'verify:quality-runner:preflight-cache-wrapper',
    'verify:deploy:config-behavior',
    'verify:deploy:config',
    'verify:frontend:preflight',
    'verify:shell:syntax',
  ]) {
    if (!quickNames.includes(required)) {
      findings.push(`quality profile quick is missing required gate: ${required}`);
    }
  }
  for (const forbidden of BACKEND_GATE_NAMES) {
    if (quickNames.includes(forbidden)) {
      findings.push(`quality profile quick must not include backend gate: ${forbidden}`);
    }
  }

  const prepushNames = gateNamesForMode(gateRegistry, 'prepush');
  for (const required of quickNames) {
    if (!prepushNames.includes(required)) {
      findings.push(`quality profile prepush must include quick gate: ${required}`);
    }
  }
  if (prepushNames.includes('verify:ci') || prepushNames.includes('test:frontend:smoke:preview')) {
    findings.push('quality profile prepush must not recurse into release/full runtime entrypoints');
  }

  const frontendNames = gateNamesForMode(gateRegistry, 'frontend');
  for (const required of ['lint', 'lint:scripts', 'build', 'verify:frontend:prod-css-integrity', 'verify:frontend:preview-contract', 'verify:frontend:bundle-budget', 'type-check']) {
    if (!frontendNames.includes(required)) {
      findings.push(`quality profile frontend is missing required gate: ${required}`);
    }
  }
  if (frontendNames.includes('verify:backend') || frontendNames.includes('verify:shell:syntax')) {
    findings.push('quality profile frontend must not include backend aggregate or shell syntax gates');
  }

  const runtimeNames = gateNamesForMode(gateRegistry, 'runtime');
  const expectedRuntime = [
    'test:frontend:smoke:public',
    'test:frontend:smoke:preview',
    'test:frontend:smoke:preview:performance',
    'verify:reports:special-browser-smoke',
  ];
  if (runtimeNames.join('\n') !== expectedRuntime.join('\n')) {
    findings.push(`quality profile runtime must be exactly ${expectedRuntime.join(', ')}; got ${runtimeNames.join(', ')}`);
  }

  const releaseNames = gateNamesForMode(gateRegistry, 'release');
  const expectedRelease = ['verify:ci', 'test:frontend:smoke:preview'];
  if (releaseNames.join('\n') !== expectedRelease.join('\n')) {
    findings.push(`quality profile release must be exactly ${expectedRelease.join(', ')}; got ${releaseNames.join(', ')}`);
  }

  return findings;
}

export function formatQualityProfilesFailure(findings) {
  return [
    `[${GUARD_NAME}] quality profile drift was detected:`,
    ...findings.map((finding) => `- ${finding}`),
    '',
    'Keep package scripts, quality profiles, and the quality gate registry synchronized.',
  ].join('\n');
}

function main() {
  const repoRoot = getRepoRoot();
  const packageJson = readRequiredPackageJson(repoRoot, fail);
  const registry = buildQualityGateRegistry({ packageJson, repoRoot });
  const findings = checkQualityProfiles({ packageJson, registry });

  if (findings.length > 0) {
    console.error(formatQualityProfilesFailure(findings));
    process.exit(1);
  }

  reportOk(`${QUALITY_PROFILE_NAMES.length} profiles, ${QUALITY_PROFILE_SCRIPT_NAMES.length} entry scripts, and quality gate registry are synchronized.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
