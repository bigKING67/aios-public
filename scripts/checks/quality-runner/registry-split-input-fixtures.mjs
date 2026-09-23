import {
  CHECK_GUARD_HELPER_INPUTS,
} from '../../lib/quality/quality-gate-inputs.mjs';

export function assertRegistrySplitInputMetadata({
  aggregateGateName,
  aggregateInputs,
  assertIncludes,
  registry,
}) {
  const guardUtilsInputs = registry.byName.get('verify:ci:guard-utils-behavior')?.inputs ?? [];
  for (const input of CHECK_GUARD_HELPER_INPUTS) {
    assertIncludes(
      aggregateInputs,
      input,
      `${aggregateGateName} cache key should include shared guard helper input ${input}`,
    );
    assertIncludes(
      guardUtilsInputs,
      input,
      `verify:ci:guard-utils-behavior cache key should include shared guard helper input ${input}`,
    );
  }

  for (const [input, label] of [
    ['scripts/lib/quality/quality-runner-affected-slice-inputs.mjs', 'affected slice input contract source'],
    ['scripts/lib/quality/quality-runner-cache-slice-inputs.mjs', 'cache slice input contract source'],
    ['scripts/lib/quality/quality-runner-cache-key-slice-inputs.mjs', 'cache key slice input contract source'],
    ['scripts/lib/quality/quality-runner-cache-remote-slice-inputs.mjs', 'remote cache slice input contract source'],
    ['scripts/lib/quality/quality-runner-scheduler-slice-inputs.mjs', 'scheduler slice input contract source'],
    ['scripts/lib/quality/quality-runner-preflight-slice-inputs.mjs', 'preflight slice input contract source'],
    ['scripts/lib/quality/gate-inputs/design-inputs.mjs', 'split design gate input source'],
    ['scripts/lib/quality/gate-inputs/frontend-delivery-inputs.mjs', 'split frontend delivery gate input source'],
    ['scripts/lib/quality/gate-inputs/frontend-structure-inputs.mjs', 'split frontend structure gate input source'],
    ['scripts/lib/quality/gate-inputs/weekly-inputs.mjs', 'split weekly gate input source'],
  ]) {
    assertIncludes(
      aggregateInputs,
      input,
      `${aggregateGateName} cache key should include ${label}`,
    );
  }

  const affectedMappingInputs = registry.byName.get('verify:quality-runner:affected-mapping')?.inputs ?? [];
  for (const [input, label] of [
    ['scripts/lib/quality/quality-runner-affected-slice-inputs.mjs', 'split affected slice input contract source'],
    ['scripts/lib/quality/quality-affected-check-script-rule-utils.mjs', 'split check script rule helper source'],
    ['scripts/lib/quality/quality-affected-selection-utils.mjs', 'split affected selection helper source'],
    ['scripts/lib/quality/quality-affected-explain.mjs', 'split affected explain helper source'],
    ['scripts/lib/quality/quality-affected-fallback-rules.mjs', 'split fallback affected rule source'],
    ['scripts/lib/quality/quality-affected-creator-library-rules.mjs', 'split creator-library affected rule source'],
    ['scripts/lib/quality/quality-affected-doc-rules.mjs', 'split docs affected rule source'],
    ['scripts/lib/quality/quality-affected-deploy-rules.mjs', 'split deploy affected rule source'],
    ['scripts/lib/quality/quality-affected-frontend-vendor-rules.mjs', 'split frontend vendor affected rule source'],
    ['scripts/lib/quality/quality-affected-frontend-check-script-rules.mjs', 'split frontend check script rules source'],
    ['scripts/lib/quality/quality-affected-design-check-script-rules.mjs', 'split design check script rules source'],
    ['scripts/lib/quality/quality-affected-platform-check-script-rules.mjs', 'split platform check script rules source'],
    ['scripts/lib/quality/affected/frontend-design-helper-rules.mjs', 'split frontend design helper affected rules source'],
    ['scripts/lib/quality/affected/frontend-delivery-helper-rules.mjs', 'split frontend delivery helper affected rules source'],
    ['scripts/lib/quality/affected/frontend-route-policy-rules.mjs', 'split frontend route policy affected rules source'],
    ['scripts/lib/quality/affected/frontend-size-module-rules.mjs', 'split frontend size and module affected rules source'],
    ['scripts/lib/quality/affected/frontend-structure-governance-rules.mjs', 'split frontend structure governance affected rules source'],
  ]) {
    assertIncludes(
      affectedMappingInputs,
      input,
      `affected-mapping cache key should include ${label}`,
    );
  }

  assertIncludes(
    registry.byName.get('verify:quality-runner:scheduler-env')?.inputs ?? [],
    'scripts/lib/quality/quality-runner-scheduler-slice-inputs.mjs',
    'scheduler-env cache key should include split scheduler slice input contract source',
  );
  assertIncludes(
    registry.byName.get('verify:quality-runner:preflight-cache-key')?.inputs ?? [],
    'scripts/lib/quality/quality-runner-preflight-slice-inputs.mjs',
    'preflight-cache-key cache key should include split preflight slice input contract source',
  );

  for (const gateName of [
    'verify:quality-runner:cache-key-digest',
    'verify:quality-runner:cache-key-env',
    'verify:quality-runner:cache-key-tool-version',
  ]) {
    assertIncludes(
      registry.byName.get(gateName)?.inputs ?? [],
      'scripts/lib/quality/quality-runner-cache-key-slice-inputs.mjs',
      `${gateName} cache key should include split cache key slice input contract source`,
    );
  }

  assertIncludes(
    registry.byName.get('verify:quality-runner:cache-artifact')?.inputs ?? [],
    'scripts/lib/quality/quality-runner-cache-artifact-fixtures.mjs',
    'cache-artifact cache key should include split artifact fixture helper',
  );

  assertIncludes(
    registry.byName.get('verify:quality-runner:cache-stats')?.inputs ?? [],
    'scripts/lib/quality/quality-runner-cache-stats-fixtures.mjs',
    'cache-stats cache key should include split stats fixture helper',
  );

  for (const gateName of [
    'verify:quality-runner:cache-remote-config',
    'verify:quality-runner:cache-remote-result',
    'verify:quality-runner:cache-remote-stats',
    'verify:quality-runner:cache-remote-repair',
    'verify:quality-runner:cache-remote-artifact',
  ]) {
    assertIncludes(
      registry.byName.get(gateName)?.inputs ?? [],
      'scripts/lib/quality/quality-runner-cache-remote-slice-inputs.mjs',
      `${gateName} cache key should include split remote cache slice input contract source`,
    );
  }

  assertIncludes(
    registry.byName.get('verify:quality-runner:cache-remote-config')?.inputs ?? [],
    '.github/workflows/quality-gate.yml',
    'remote cache config gate should hash the GitHub Actions cache/env contract',
  );
  assertIncludes(
    registry.byName.get('verify:quality-runner:cache-remote-config')?.inputs ?? [],
    'scripts/lib/ci/quality-workflow-contract-core.mjs',
    'remote cache config gate should hash the shared workflow contract checker',
  );
}
