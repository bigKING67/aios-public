import {
  QUALITY_RUNNER_AGGREGATE_GATE_NAME,
  QUALITY_RUNNER_AGGREGATE_INPUTS,
  QUALITY_RUNNER_SLICE_DEFINITIONS,
} from '../../lib/quality/quality-runner-slices.mjs';
import {
  assertRegistrySplitInputMetadata,
} from './registry-split-input-fixtures.mjs';

export function assertRegistryAggregateInputMetadata({
  assertIncludes,
  registry,
}) {
  const aggregateInputs = registry.byName.get(QUALITY_RUNNER_AGGREGATE_GATE_NAME)?.inputs ?? [];
  for (const input of QUALITY_RUNNER_AGGREGATE_INPUTS) {
    assertIncludes(
      aggregateInputs,
      input,
      `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include aggregate action input ${input}`,
    );
  }
  assertIncludes(
    aggregateInputs,
    'scripts/lib/quality/quality-runner-slices.mjs',
    `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include slice metadata source`,
  );
  assertIncludes(
    aggregateInputs,
    'scripts/lib/quality/quality-runner-slice-definitions.mjs',
    `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include slice definition source`,
  );
  assertIncludes(
    aggregateInputs,
    'scripts/lib/quality/quality-runner-slice-definition-utils.mjs',
    `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include slice definition helper source`,
  );
  assertIncludes(
    aggregateInputs,
    'scripts/lib/quality/quality-runner-affected-slice-definitions.mjs',
    `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include affected slice definition source`,
  );
  assertIncludes(
    aggregateInputs,
    'scripts/lib/quality/quality-runner-cache-slice-definitions.mjs',
    `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include cache slice definition source`,
  );
  assertIncludes(
    aggregateInputs,
    'scripts/lib/quality/quality-runner-compat-slice-definitions.mjs',
    `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include compatibility slice definition source`,
  );
  assertIncludes(
    aggregateInputs,
    'scripts/lib/quality/quality-runner-slice-inputs.mjs',
    `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include slice input contract source`,
  );
  assertRegistrySplitInputMetadata({
    aggregateGateName: QUALITY_RUNNER_AGGREGATE_GATE_NAME,
    aggregateInputs,
    assertIncludes,
    registry,
  });
  assertIncludes(
    aggregateInputs,
    'scripts/lib/ci/verify-ci-run-gate-utils.mjs',
    `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include verify-ci gate helper source`,
  );
  assertIncludes(
    aggregateInputs,
    'scripts/lib/ci/verify-ci-design-run-gates.mjs',
    `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include verify-ci design run gate source`,
  );
  assertIncludes(
    aggregateInputs,
    'scripts/lib/ci/verify-ci-frontend-run-gates.mjs',
    `${QUALITY_RUNNER_AGGREGATE_GATE_NAME} cache key should include verify-ci frontend run gate source`,
  );
  assertIncludes(
    registry.byName.get('verify:design:docs')?.inputs ?? [],
    'scripts/lib/ci/verify-ci-design-run-gates.mjs',
    'verify:design:docs cache key should include split verify-ci design run gates through docsQuality inputs',
  );
  assertIncludes(
    registry.byName.get('verify:frontend:quality-docs-drift')?.inputs ?? [],
    'scripts/lib/ci/verify-ci-frontend-run-gates.mjs',
    'verify:frontend:quality-docs-drift cache key should include split verify-ci frontend run gates through docsQuality inputs',
  );
  for (const definition of QUALITY_RUNNER_SLICE_DEFINITIONS) {
    const gateInputs = registry.byName.get(definition.name)?.inputs ?? [];
    for (const input of definition.inputs) {
      assertIncludes(
        gateInputs,
        input,
        `${definition.name} registry cache key should include colocated action input ${input}`,
      );
    }
  }
}
