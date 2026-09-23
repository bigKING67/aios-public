import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';
import {
  CI_META_GATES,
} from '../../lib/quality/quality-affected-gates.mjs';

export function assertQualityRunnerAffectedActionMapping({
  assertExcludesAll,
  assertFalse,
  assertTrue,
  registry,
}) {
  const affectedFilesCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/affected-files.mjs']);
  assertTrue(affectedFilesCheck.names.includes('verify:quality-runner:affected-files'), 'affected-files helper should select affected files slice from metadata');
  assertFalse(affectedFilesCheck.names.includes('verify:quality-runner:affected-mode'), 'affected-files helper should not fan out to affected mode slice');
  assertFalse(affectedFilesCheck.names.includes('verify:quality-runner:affected-mapping'), 'affected-files helper should not fan out to affected mapping slice');
  assertFalse(affectedFilesCheck.names.includes('verify:quality-runner:cache-local'), 'affected-files helper should not fan out to cache slice');

  const affectedCompatCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/affected.mjs']);
  assertTrue(affectedCompatCheck.names.includes('verify:quality-runner:affected-mapping'), 'affected compatibility aggregate should select affected mapping slice');
  assertTrue(affectedCompatCheck.names.includes('verify:quality-runner:affected-mode'), 'affected compatibility aggregate should select affected mode slice');
  assertTrue(affectedCompatCheck.names.includes('verify:quality-runner:affected-explain'), 'affected compatibility aggregate should select affected explain slice');
  assertTrue(affectedCompatCheck.names.includes('verify:quality-runner:affected-runtime-status'), 'affected compatibility aggregate should select affected runtime status slice');
  assertTrue(affectedCompatCheck.names.includes('verify:quality-runner:affected-runtime-env'), 'affected compatibility aggregate should select affected runtime env slice');
  assertTrue(affectedCompatCheck.names.includes('verify:quality-runner:affected-files'), 'affected compatibility aggregate should select affected files slice');
  assertTrue(affectedCompatCheck.names.includes('verify:quality-runner:prepush'), 'affected compatibility aggregate should select prepush slice');
  assertTrue(!affectedCompatCheck.names.includes('verify:quality-runner:cache-local'), 'affected compatibility aggregate should not fan out to cache slice');

  const affectedModeSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/affected-mode.mjs']);
  assertTrue(affectedModeSliceCheck.names.includes('verify:quality-runner:affected-mode'), 'affected-mode self-check source should select affected mode slice');
  assertFalse(affectedModeSliceCheck.names.includes('verify:quality-runner:affected-explain'), 'affected-mode self-check source should not fan out to affected explain slice');
  assertFalse(affectedModeSliceCheck.names.includes('verify:quality-runner:affected-runtime-status'), 'affected-mode self-check source should not fan out to affected runtime status slice');
  assertFalse(affectedModeSliceCheck.names.includes('verify:quality-runner:affected-runtime-env'), 'affected-mode self-check source should not fan out to affected runtime env slice');
  assertFalse(affectedModeSliceCheck.names.includes('verify:quality-runner:affected-files'), 'affected-mode self-check source should not fan out to affected files slice');
  assertTrue(!affectedModeSliceCheck.names.includes('verify:quality-runner:affected-mapping'), 'affected-mode self-check source should not fan out to affected mapping slice');
  assertTrue(!affectedModeSliceCheck.names.includes('verify:quality-runner:cache-local'), 'affected-mode self-check source should not fan out to cache slice');
  assertFalse(affectedModeSliceCheck.names.includes('verify:frontend:preflight'), 'affected-mode self-check source should not select frontend preflight');

  const affectedMappingSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/affected-mapping.mjs']);
  assertTrue(affectedMappingSliceCheck.names.includes('verify:quality-runner:affected-mapping'), 'affected-mapping self-check source should select affected mapping slice');
  assertFalse(affectedMappingSliceCheck.names.includes('verify:quality-runner:affected-mode'), 'affected-mapping self-check source should not fan out to affected mode slice');
  assertFalse(affectedMappingSliceCheck.names.includes('verify:quality-runner:hook'), 'affected-mapping self-check source should not fan out to hook slice');

  const affectedExplainSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/affected-explain.mjs']);
  assertTrue(affectedExplainSliceCheck.names.includes('verify:quality-runner:affected-explain'), 'affected-explain self-check source should select affected explain slice');
  assertFalse(affectedExplainSliceCheck.names.includes('verify:quality-runner:affected-mode'), 'affected-explain self-check source should not fan out to affected mode slice');
  assertFalse(affectedExplainSliceCheck.names.includes('verify:quality-runner:affected-runtime-status'), 'affected-explain self-check source should not fan out to affected runtime status slice');
  assertFalse(affectedExplainSliceCheck.names.includes('verify:quality-runner:affected-runtime-env'), 'affected-explain self-check source should not fan out to affected runtime env slice');

  const affectedRuntimeSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/affected-runtime.mjs']);
  assertTrue(affectedRuntimeSliceCheck.names.includes('verify:quality-runner:affected-runtime-status'), 'affected-runtime compatibility source should select affected runtime status slice');
  assertTrue(affectedRuntimeSliceCheck.names.includes('verify:quality-runner:affected-runtime-env'), 'affected-runtime compatibility source should select affected runtime env slice');
  assertFalse(affectedRuntimeSliceCheck.names.includes('verify:quality-runner:affected-mode'), 'affected-runtime self-check source should not fan out to affected mode slice');
  assertFalse(affectedRuntimeSliceCheck.names.includes('verify:quality-runner:affected-explain'), 'affected-runtime self-check source should not fan out to affected explain slice');

  const affectedRuntimeStatusSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/affected-runtime-status.mjs']);
  assertTrue(affectedRuntimeStatusSliceCheck.names.includes('verify:quality-runner:affected-runtime-status'), 'affected-runtime-status self-check source should select affected runtime status slice');
  assertExcludesAll(
    affectedRuntimeStatusSliceCheck.names,
    CI_META_GATES,
    'metadata-derived affected-runtime-status self-check source should not fan out to CI meta gates',
  );
  assertFalse(affectedRuntimeStatusSliceCheck.names.includes('verify:quality-runner:affected-runtime-env'), 'affected-runtime-status self-check source should not fan out to affected runtime env slice');
  assertFalse(affectedRuntimeStatusSliceCheck.names.includes('verify:quality-runner:affected-mode'), 'affected-runtime-status self-check source should not fan out to affected mode slice');

  const affectedRuntimeEnvSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/affected-runtime-env.mjs']);
  assertTrue(affectedRuntimeEnvSliceCheck.names.includes('verify:quality-runner:affected-runtime-env'), 'affected-runtime-env self-check source should select affected runtime env slice');
  assertFalse(affectedRuntimeEnvSliceCheck.names.includes('verify:quality-runner:affected-runtime-status'), 'affected-runtime-env self-check source should not fan out to affected runtime status slice');
  assertFalse(affectedRuntimeEnvSliceCheck.names.includes('verify:quality-runner:affected-mode'), 'affected-runtime-env self-check source should not fan out to affected mode slice');

  const prepushSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/prepush.mjs']);
  assertTrue(prepushSliceCheck.names.includes('verify:quality-runner:prepush'), 'prepush self-check source should select prepush slice');
  assertFalse(prepushSliceCheck.names.includes('verify:quality-runner:affected-mode'), 'prepush self-check source should not fan out to affected mode slice');
  assertFalse(prepushSliceCheck.names.includes('verify:quality-runner:hook'), 'prepush self-check source should not fan out to hook slice');
}
