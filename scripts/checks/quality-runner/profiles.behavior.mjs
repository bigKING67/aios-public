#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  checkQualityProfiles,
  formatQualityProfilesFailure,
} from './profiles.mjs';
import {
  VERIFY_CI_META_GATES,
} from '../../lib/ci/verify-ci-meta-gates.mjs';
import {
  QUALITY_ENTRYPOINT_SCRIPTS,
  QUALITY_RUNNER_BEHAVIOR_COMMAND,
  QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS,
  VIRTUAL_QUALITY_PACKAGE_SCRIPTS,
  buildQualityGateRegistry,
} from '../../lib/quality/quality-gate-registry.mjs';

const { assertEqual, assertIncludes, reportOk } = createCheckGuard(
  'quality-profiles-behavior',
);

const PASS_OUTPUT = '[quality-profiles] OK: quality profiles are synchronized.\n';

function scriptsFor(overrides = {}) {
  const scripts = {
    ...QUALITY_ENTRYPOINT_SCRIPTS,
    ...QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS,
    'verify:quality-runner': QUALITY_RUNNER_BEHAVIOR_COMMAND,
    lint: 'eslint eslint.config.mjs postcss.config.js scripts backend-rust/scripts --cache --cache-location .cache/eslint/full/ --cache-strategy content',
    'lint:scripts': 'eslint scripts eslint.config.mjs backend-rust/scripts --cache --cache-location .cache/eslint/scripts/ --cache-strategy content',
    build: 'npm run build:vite',
    'build:vite': 'vite build --config apps/web-vite/vite.config.ts && node scripts/build/write-frontend-build-manifest.mjs',
    'type-check': 'tsc -p tsconfig.frontend.json --noEmit',
    'test:frontend:smoke:public': 'npm run test:frontend:smoke',
    'test:frontend:smoke:preview': 'node scripts/frontend/run-frontend-smoke-preview.mjs --profile public',
    'test:frontend:smoke:preview:performance': 'FRONTEND_SMOKE_PERFORMANCE_BUDGET=1 node scripts/frontend/run-frontend-smoke-preview.mjs --profile public',
    'test:frontend:smoke:preview:authenticated:performance': 'FRONTEND_SMOKE_PERFORMANCE_BUDGET=1 node scripts/frontend/run-frontend-smoke-preview.mjs --profile authenticated',
  };
  for (const gate of VERIFY_CI_META_GATES) {
    scripts[gate.name] = gate.command;
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const registry = buildQualityGateRegistry({ packageJson: { scripts } });
    for (const gate of registry.gates) {
      if (Object.hasOwn(VIRTUAL_QUALITY_PACKAGE_SCRIPTS, gate.name)) {
        continue;
      }
      scripts[gate.name] ??= gate.command || `fixture command for ${gate.name}`;
    }
  }
  const merged = { ...scripts };
  for (const [scriptName, command] of Object.entries(overrides)) {
    if (command === undefined) {
      delete merged[scriptName];
    } else {
      merged[scriptName] = command;
    }
  }
  return merged;
}

function runQualityProfilesGuard(packageScripts) {
  const packageJson = {
    private: true,
    scripts: packageScripts,
  };
  const registry = buildQualityGateRegistry({ packageJson });
  const findings = checkQualityProfiles({ packageJson, registry });

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: PASS_OUTPUT,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatQualityProfilesFailure(findings)}\n`,
  };
}

function findingsFor(overrides = {}) {
  const packageJson = { scripts: scriptsFor(overrides) };
  const registry = buildQualityGateRegistry({ packageJson });
  return checkQualityProfiles({
    packageJson,
    registry,
  });
}

function assertPass(overrides, message) {
  const findings = findingsFor(overrides);
  assertEqual(findings.length, 0, `${message}: ${findings.join('\n')}`);
}

function assertFail(overrides, expectedSnippet, message) {
  const findings = findingsFor(overrides);
  assertIncludes(findings.join('\n'), expectedSnippet, message);
}

assertPass({}, 'complete quality profile fixture should pass');

{
  const result = runQualityProfilesGuard(scriptsFor());
  assertEqual(result.status, 0, 'runtime package fixture should pass the executable quality profile guard');
  assertIncludes(
    result.stdout,
    'profiles',
    'runtime package fixture should report synchronized profile state',
  );
}

assertFail(
  { 'verify:quick': 'node scripts/ci/run-quality-profile.mjs quick' },
  'verify:quick package script drifted',
  'legacy profile package script should fail',
);

assertFail(
  { 'verify:quality-runner': 'node scripts/old-runner.mjs' },
  'verify:quality-runner package script drifted',
  'quality-runner script drift should fail',
);

assertFail(
  { 'verify:quality:stats-policy:required': 'QUALITY_STATS_LIVE_BUDGET=1 QUALITY_STATS_BUDGET_ACTION_SEVERITY_SCOPE=required node scripts/checks/quality-runner/cache-stats.mjs' },
  'verify:quality:stats-policy:required package script drifted',
  'required-only stats policy entry script drift should fail',
);

assertFail(
  { 'verify:quality-runner:affected': 'node scripts/checks/quality-runner/behavior.mjs' },
  'verify:quality-runner:affected is a virtual compatibility quality-runner slice',
  'quality-runner affected compatibility slice package script should fail',
);

assertFail(
  { 'verify:quality-runner:cache': 'node scripts/checks/quality-runner/behavior.mjs' },
  'verify:quality-runner:cache is a virtual compatibility quality-runner slice',
  'quality-runner compatibility slice package script should fail',
);

assertFail(
  { 'verify:quality-runner:hook': 'node scripts/checks/quality-runner/behavior.mjs --slice hook' },
  'verify:quality-runner:hook package script drifted',
  'quality-runner primary slice package drift should fail',
);

assertFail(
  { 'verify:frontend': undefined },
  'verify:frontend package script drifted',
  'missing frontend entry script should fail',
);

reportOk('runtime fixture, pass, legacy script drift, quality-runner drift, virtual slice drift, and missing entry checks passed.');
