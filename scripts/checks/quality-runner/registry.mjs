#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  buildQualityGateRegistry,
  expandNamedInputPatterns,
  gateNamesForMode,
  readPackageJsonForRegistry,
  selectGatesByNames,
  validateQualityGateRegistry,
} from '../../lib/quality/quality-gate-registry.mjs';
import {
  QUALITY_ENTRYPOINT_SCRIPTS,
  QUALITY_RUNNER_REGISTRY_BASE_GATES,
} from '../../config/quality/quality-gates.mjs';
import {
  printUsage,
} from '../../lib/quality/quality-runner-args.mjs';
import {
  baselineGateNamesForMode,
} from '../../lib/quality/quality-affected.mjs';
import {
  assertRegistryCommandLayout,
} from './registry-command-layout-fixtures.mjs';
import {
  assertRegistryCiRuntimeInputs,
} from './registry-ci-runtime-input-fixtures.mjs';
import {
  assertRegistryDesignInputs,
} from './registry-design-input-fixtures.mjs';
import {
  assertRegistryFrontendDeliveryInputs,
} from './registry-frontend-delivery-fixtures.mjs';
import {
  assertRegistryReportInputs,
} from './registry-reports-fixtures.mjs';
import {
  assertRegistryRunnerInputs,
} from './registry-runner-input-fixtures.mjs';
import {
  assertRegistrySliceMetadata,
} from './registry-slice-metadata-fixtures.mjs';
import {
  assertRegistryWeeklyInputs,
} from './registry-weekly-input-fixtures.mjs';

const {
  assertDeepEqual,
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-registry-behavior');

export function runQualityRunnerRegistryBehaviorCheck(options = {}) {
  const {
    repoRoot = process.cwd(),
  } = options;

  const registry = buildQualityGateRegistry({ repoRoot });
  const findings = validateQualityGateRegistry(registry, { repoRoot });
  assertEqual(findings.length, 0, `real registry should be valid: ${findings.join('\n')}`);
  assertTrue(
    !registry.ciGateNames.includes('verify:backend'),
    'ci mode should expand backend aggregate into leaf backend gates',
  );
  assertTrue(
    registry.ciGateNames.includes('verify:backend:size'),
    'ci mode should include backend leaf gates',
  );
  assertRegistryFrontendDeliveryInputs({
    assertEqual,
    assertFalse,
    assertIncludes,
    assertTrue,
    registry,
  });
  assertRegistryReportInputs({
    assertEqual,
    assertFalse,
    assertIncludes,
    assertTrue,
    registry,
  });
  assertRegistryRunnerInputs({
    assertFalse,
    assertTrue,
    registry,
  });
  assertRegistryCiRuntimeInputs({
    assertFalse,
    assertIncludes,
    assertTrue,
    registry,
  });
  assertRegistryWeeklyInputs({
    assertFalse,
    assertTrue,
    registry,
  });
  assertRegistryDesignInputs({
    assertFalse,
    assertTrue,
    registry,
  });
  assertEqual(
    expandNamedInputPatterns(['@packageRuntime', '@componentSource']).join(','),
    'package.json,package-lock.json,apps/web-vite/src/components/**,apps/web-vite/src/lib/**',
    'named input expansion should be deterministic and preserve named group ordering',
  );

  const quickNames = gateNamesForMode(registry, 'quick');
  const prepushNames = gateNamesForMode(registry, 'prepush');
  assertTrue(quickNames.every((name) => prepushNames.includes(name)), 'prepush profile should include quick gates');
  assertTrue(!prepushNames.includes('verify:ci'), 'prepush profile should not recurse into verify:ci');
  assertEqual(
    baselineGateNamesForMode('prepush').join(','),
    'verify:ci:release-version-bump,verify:frontend:preflight',
    'prepush dynamic baseline should keep only non-affected always-on release/preflight safety gates',
  );
  assertRegistrySliceMetadata({
    assertDeepEqual,
    assertEqual,
    assertFalse,
    assertIncludes,
    assertTrue,
    registry,
  });
  assertRegistryCommandLayout({ assertEqual, assertIncludes, repoRoot });

  const descriptorGateNames = QUALITY_RUNNER_REGISTRY_BASE_GATES.map((gate) => gate.name);
  assertEqual(
    new Set(descriptorGateNames).size,
    descriptorGateNames.length,
    'canonical descriptor base gate names should be unique',
  );
  const packageScripts = readPackageJsonForRegistry(repoRoot).scripts ?? {};
  for (const [name, command] of Object.entries(QUALITY_ENTRYPOINT_SCRIPTS)) {
    assertEqual(packageScripts[name], command, `${name} should match the canonical descriptor`);
  }
  const knownSelection = selectGatesByNames(registry, ['verify:backend:test']);
  assertEqual(knownSelection.missing.length, 0, 'known direct gate selection should resolve');
  assertIncludes(
    knownSelection.gates.map((gate) => gate.name),
    'verify:backend:check',
    'direct gate selection should include canonical dependencies',
  );
  const unknownSelection = selectGatesByNames(registry, ['does:not:exist']);
  assertEqual(unknownSelection.gates.length, 0, 'unknown direct gate selection should not invent a gate');
  assertEqual(unknownSelection.missing.join(','), 'does:not:exist', 'unknown direct gate selection should report the missing name');
  let usage = '';
  printUsage({ write: (chunk) => { usage += chunk; } });
  assertIncludes(usage, 'quality-runner.mjs gate <gate-name>', 'usage should document direct gate execution');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerRegistryBehaviorCheck();
  reportOk('registry metadata, profile inputs, command layout, and mode baseline checks passed.');
}
