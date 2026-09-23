import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';
import {
  CACHE_REMOTE_SLICE_GATES,
} from './affected-mapping-cache-fixtures.mjs';
import {
  SCHEDULER_SLICE_GATES,
} from './affected-mapping-scheduler-fixtures.mjs';

export function assertBehaviorDispatchAffectedMapping({
  assertFalse,
  assertIncludesAll,
  assertTrue,
  registry,
}) {
  for (const [file, label] of [
    ['scripts/checks/quality-runner/behavior-dispatch.mjs', 'behavior dispatch metadata'],
    ['scripts/checks/quality-runner/behavior-dispatch-table.mjs', 'behavior dispatch table'],
  ]) {
    const behaviorDispatchCheck = selectAffectedGates(registry, [file]);
    assertFalse(
      behaviorDispatchCheck.names.includes('verify:quality-runner'),
      `${label} should not select aggregate behavior check in affected mode`,
    );
    assertTrue(behaviorDispatchCheck.names.includes('verify:quality-runner:registry'), `${label} should select registry slice`);
    assertTrue(behaviorDispatchCheck.names.includes('verify:quality-runner:affected-mapping'), `${label} should select affected mapping slice`);
    assertTrue(behaviorDispatchCheck.names.includes('verify:quality-runner:affected-explain'), `${label} should select affected explain slice`);
    assertTrue(behaviorDispatchCheck.names.includes('verify:quality-runner:affected-runtime-status'), `${label} should select affected runtime status slice`);
    assertTrue(behaviorDispatchCheck.names.includes('verify:quality-runner:affected-runtime-env'), `${label} should select affected runtime env slice`);
    assertTrue(behaviorDispatchCheck.names.includes('verify:quality-runner:cache-key-digest'), `${label} should select cache key digest slice`);
    assertTrue(behaviorDispatchCheck.names.includes('verify:quality-runner:cache-key-env'), `${label} should select cache key env slice`);
    assertTrue(behaviorDispatchCheck.names.includes('verify:quality-runner:cache-key-tool-version'), `${label} should select cache key tool-version slice`);
    assertTrue(behaviorDispatchCheck.names.includes('verify:quality-runner:cache-local'), `${label} should select cache slices`);
    assertIncludesAll(behaviorDispatchCheck.names, CACHE_REMOTE_SLICE_GATES, `${label} should select remote cache slices`);
    assertIncludesAll(behaviorDispatchCheck.names, SCHEDULER_SLICE_GATES, `${label} should select scheduler slices`);
  }
}
