import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';
import {
  QUALITY_RUNNER_PREFLIGHT_CACHE_SLICE_GATES,
  QUALITY_RUNNER_PRIMARY_SLICE_GATES_BY_CHECK_FILE,
} from '../../lib/quality/quality-runner-slices.mjs';

export function assertPrimarySliceCheckFileAffectedMapping({
  assertFalse,
  assertTrue,
  registry,
}) {
  for (const [file, expectedGates] of Object.entries(QUALITY_RUNNER_PRIMARY_SLICE_GATES_BY_CHECK_FILE)) {
    const selection = selectAffectedGates(registry, [file]);
    for (const gateName of expectedGates) {
      assertTrue(
        selection.names.includes(gateName),
        `${file} should select metadata-derived primary slice gate ${gateName}`,
      );
      assertTrue(
        (selection.reasons?.[gateName] ?? []).some((reason) => reason.startsWith(`${file}:`)),
        `${file} should explain why primary slice gate ${gateName} was selected`,
      );
    }

    if (expectedGates.some((gateName) => QUALITY_RUNNER_PREFLIGHT_CACHE_SLICE_GATES.includes(gateName))) {
      assertFalse(
        selection.names.includes('verify:frontend:preflight'),
        `${file} self-check source should not select production frontend preflight gate`,
      );
    }
  }
}
