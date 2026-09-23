import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';
import {
  SCHEDULER_SLICE_GATES,
} from './affected-mapping-scheduler-fixtures.mjs';

function assertRegistrySourceSelectsRegistrySlice({
  assertExcludesAll,
  assertFalse,
  assertTrue,
  file,
  label,
  registry,
}) {
  const selection = selectAffectedGates(registry, [file]);
  assertTrue(selection.names.includes('verify:quality-runner:registry'), `${label} source should select registry slice`);
  assertExcludesAll(selection.names, SCHEDULER_SLICE_GATES, `${label} source should not fan out to scheduler slice`);
  assertFalse(selection.names.includes('verify:quality-runner:cache-local'), `${label} source should not fan out to cache slice`);
}

export function assertRegistryFixtureAffectedMapping({
  assertExcludesAll,
  assertFalse,
  assertTrue,
  registry,
}) {
  for (const [file, label] of [
    ['scripts/checks/quality-runner/registry.mjs', 'registry self-check'],
    ['scripts/checks/quality-runner/registry-primary-check-file-fixtures.mjs', 'registry primary check-file fixture'],
    ['scripts/checks/quality-runner/registry-aggregate-input-fixtures.mjs', 'registry aggregate-input fixture'],
    ['scripts/checks/quality-runner/registry-ci-runtime-input-fixtures.mjs', 'registry CI runtime input fixture'],
    ['scripts/checks/quality-runner/registry-command-layout-fixtures.mjs', 'registry command-layout fixture'],
    ['scripts/checks/quality-runner/registry-design-input-fixtures.mjs', 'registry design input fixture'],
    ['scripts/checks/quality-runner/registry-frontend-delivery-fixtures.mjs', 'registry frontend-delivery fixture'],
    ['scripts/checks/quality-runner/registry-lib-gate-group-fixtures.mjs', 'registry lib gate-group fixture'],
    ['scripts/checks/quality-runner/registry-reports-fixtures.mjs', 'registry reports fixture'],
    ['scripts/checks/quality-runner/registry-runner-input-fixtures.mjs', 'registry runner input fixture'],
    ['scripts/checks/quality-runner/registry-slice-definition-fixtures.mjs', 'registry slice-definition fixture'],
    ['scripts/checks/quality-runner/registry-slice-gate-group-fixtures.mjs', 'registry slice gate-group fixture'],
    ['scripts/checks/quality-runner/registry-slice-metadata-fixtures.mjs', 'registry slice-metadata fixture'],
    ['scripts/checks/quality-runner/registry-split-input-fixtures.mjs', 'registry split-input fixture'],
    ['scripts/checks/quality-runner/registry-weekly-input-fixtures.mjs', 'registry weekly input fixture'],
  ]) {
    assertRegistrySourceSelectsRegistrySlice({
      assertExcludesAll,
      assertFalse,
      assertTrue,
      file,
      label,
      registry,
    });
  }
}
