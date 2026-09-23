import {
  ALLOWLIST_CONFIG_INPUT_GATE_GROUPS,
} from '../../lib/quality/quality-allowlist-affected-gates.mjs';
import {
  QUALITY_RUNNER_SCHEDULER_SLICE_GATES,
} from '../../lib/quality/quality-runner-slices.mjs';

export function assertRegistryRunnerInputs({
  assertFalse,
  assertTrue,
  registry,
}) {
  assertFalse(
    registry.gates.some((gate) => gate.inputs.some((input) => input.startsWith('@'))),
    'registry should expand named inputs before gates are exposed to cache key computation',
  );

  for (const [file, gates] of Object.entries(ALLOWLIST_CONFIG_INPUT_GATE_GROUPS)) {
    for (const gateName of gates) {
      assertTrue(
        registry.byName.get(gateName)?.inputs.includes(file),
        `${gateName} cache key should include ${file}`,
      );
    }
  }

  assertTrue(
    registry.byName.get('verify:quality-runner:registry')?.inputs.includes('scripts/checks/quality-runner/registry.mjs'),
    'registry self-check cache key should include its independent action file',
  );
  assertTrue(
    registry.byName.get('verify:quality-runner:registry')?.inputs.includes('scripts/checks/quality-runner/behavior-dispatch.mjs'),
    'registry self-check cache key should include behavior dispatch metadata',
  );
  assertFalse(
    registry.byName.get('verify:quality-runner:registry')?.inputs.includes('scripts/checks/quality-runner/behavior.mjs'),
    'registry self-check should not hash the monolithic behavior action after split',
  );
  assertTrue(
    registry.byName.get('verify:quality-runner:benchmark')?.inputs.includes('scripts/checks/quality-runner/benchmark.mjs'),
    'benchmark self-check cache key should include its independent action file',
  );
  assertTrue(
    registry.byName.get('verify:quality-runner:benchmark')?.inputs.includes('scripts/lib/quality/quality-runner-actions.mjs'),
    'benchmark self-check cache key should include runner action source',
  );
  assertFalse(
    registry.byName.get('verify:quality-runner:benchmark')?.inputs.includes('scripts/checks/quality-runner/behavior.mjs'),
    'benchmark self-check should not hash the monolithic behavior action after split',
  );
  assertFalse(
    registry.byName.has('verify:quality-runner:scheduler'),
    'scheduler compatibility aggregate should not be a primary registry gate after split',
  );
  assertTrue(
    registry.byName.get('verify:quality-runner:scheduler-env')?.inputs.includes('scripts/checks/quality-runner/scheduler-env.mjs'),
    'scheduler env self-check cache key should include its independent action file',
  );
  assertTrue(
    registry.byName.get('verify:quality-runner:scheduler-shell')?.inputs.includes('scripts/lib/ci/shell-syntax-core.mjs'),
    'scheduler shell self-check cache key should include split shell syntax core',
  );
  assertTrue(
    registry.byName.get('verify:quality-runner:scheduler-concurrency')?.inputs.includes('scripts/lib/quality/quality-scheduler.mjs'),
    'scheduler concurrency self-check cache key should include scheduler runtime source',
  );
  for (const schedulerGate of QUALITY_RUNNER_SCHEDULER_SLICE_GATES) {
    assertFalse(
      registry.byName.get(schedulerGate)?.inputs.includes('scripts/checks/quality-runner/behavior.mjs'),
      `${schedulerGate} should not hash the monolithic behavior action after split`,
    );
  }
  assertTrue(
    registry.byName.get('verify:quality-runner:affected-mapping')?.inputs.includes('scripts/checks/quality-runner/affected-mapping.mjs'),
    'affected-mapping self-check cache key should include its independent action file',
  );
  assertFalse(
    registry.byName.get('verify:quality-runner:affected-mapping')?.inputs.includes('scripts/checks/quality-runner/behavior.mjs'),
    'affected-mapping self-check should not hash the monolithic behavior action after split',
  );
  assertTrue(
    registry.byName.get('verify:quality-runner:prepush')?.inputs.includes('scripts/checks/quality-runner/prepush.mjs'),
    'prepush self-check cache key should include its independent action file',
  );
  assertFalse(
    registry.byName.get('verify:quality-runner:prepush')?.inputs.includes('scripts/checks/quality-runner/behavior.mjs'),
    'prepush self-check should not hash the monolithic behavior action after split',
  );
}
