import {
  QUALITY_RUNNER_LIB_GATE_GROUPS,
} from '../../lib/quality/quality-affected-gates.mjs';

export function assertRegistryLibGateGroupMetadata({
  assertFalse,
  assertTrue,
  registry,
}) {
  const qualityRunnerLibGroupFiles = new Set();
  for (const group of QUALITY_RUNNER_LIB_GATE_GROUPS) {
    assertTrue(group.files.length > 0, 'quality-runner lib gate group should declare files');
    assertTrue(group.gates.length > 0, 'quality-runner lib gate group should declare gates');
    assertTrue(group.reason.length > 0, 'quality-runner lib gate group should declare a reason');
    for (const file of group.files) {
      assertTrue(
        file.startsWith('scripts/lib/') || file === 'scripts/config/quality/quality-gates.mjs',
        `${file} should be a quality infrastructure source`,
      );
      assertFalse(
        qualityRunnerLibGroupFiles.has(file),
        `${file} should be assigned to only one quality-runner lib gate group`,
      );
      qualityRunnerLibGroupFiles.add(file);
    }
    for (const gateName of group.gates) {
      assertTrue(
        registry.byName.has(gateName),
        `quality-runner lib gate group should reference existing gate ${gateName}`,
      );
    }
  }
}
