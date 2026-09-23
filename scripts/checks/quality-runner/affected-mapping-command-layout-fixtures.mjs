import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';
import {
  SCHEDULER_SLICE_GATES,
} from './affected-mapping-scheduler-fixtures.mjs';

export function assertCommandLayoutAffectedMapping({
  assertExcludesAll,
  assertFalse,
  assertTrue,
  registry,
}) {
  for (const [file, label] of [
    ['scripts/checks/quality-runner/command-layout.mjs', 'quality runner command layout CLI'],
    ['scripts/lib/quality/quality-command-layout-core.mjs', 'quality runner command layout core helper'],
    ['scripts/lib/quality/quality-command-layout-legacy-paths.mjs', 'quality runner command layout legacy path source'],
  ]) {
    const selection = selectAffectedGates(registry, [file]);
    assertTrue(selection.names.includes('verify:quality-runner:registry'), `${label} should select registry slice from metadata`);
    assertExcludesAll(selection.names, SCHEDULER_SLICE_GATES, `${label} should not fan out to scheduler slice`);
    assertFalse(selection.names.includes('verify:quality-runner:cache-local'), `${label} should not fan out to cache slice`);
  }
}
