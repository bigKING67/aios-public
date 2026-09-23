import {
  QUALITY_RUNNER_PRIMARY_SLICE_GATES_BY_CHECK_FILE,
  QUALITY_RUNNER_SLICE_DEFINITIONS,
} from '../../lib/quality/quality-runner-slices.mjs';

export function assertRegistryPrimaryCheckFileMetadata({
  assertIncludes,
}) {
  for (const definition of QUALITY_RUNNER_SLICE_DEFINITIONS) {
    for (const input of definition.inputs) {
      if (!input.startsWith('scripts/checks/quality-runner/') || input.includes('*')) {
        continue;
      }
      assertIncludes(
        QUALITY_RUNNER_PRIMARY_SLICE_GATES_BY_CHECK_FILE[input] ?? [],
        definition.name,
        `${input} should map back to ${definition.name} through primary slice check-file metadata`,
      );
    }
  }
}
