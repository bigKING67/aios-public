import {
  commandTargetFiles,
} from '../../lib/quality/quality-gate-command-targets.mjs';
import {
  QUALITY_RUNNER_ACTION_DEFINITION_BY_NAME,
  QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS,
  QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS,
  QUALITY_RUNNER_SLICE_DEFINITIONS,
} from '../../lib/quality/quality-runner-slices.mjs';

export function assertRegistrySliceDefinitionMetadata({
  assertEqual,
  assertIncludes,
  assertTrue,
}) {
  for (const definition of [
    ...QUALITY_RUNNER_SLICE_DEFINITIONS,
    ...QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS,
  ]) {
    assertTrue(
      QUALITY_RUNNER_ACTION_DEFINITION_BY_NAME[definition.name] === definition,
      `${definition.name} should be indexed by action name`,
    );
    assertEqual(
      QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS[definition.name],
      definition.command,
      `${definition.name} package script metadata should stay synchronized with the action definition`,
    );
    assertTrue(definition.inputs.length > 0, `${definition.name} should declare action input contracts`);
    assertEqual(
      new Set(definition.inputs).size,
      definition.inputs.length,
      `${definition.name} action input contracts should be unique`,
    );
    for (const targetFile of commandTargetFiles(definition.command)) {
      assertIncludes(
        definition.inputs,
        targetFile,
        `${definition.name} action input contract should include command target ${targetFile}`,
      );
    }
  }
  for (const scriptName of Object.keys(QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS)) {
    assertTrue(
      Boolean(QUALITY_RUNNER_ACTION_DEFINITION_BY_NAME[scriptName]),
      `${scriptName} package script metadata should point at a known quality-runner action definition`,
    );
  }
}
