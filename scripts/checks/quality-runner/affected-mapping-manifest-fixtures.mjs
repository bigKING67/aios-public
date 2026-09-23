import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';

export function assertManifestAffectedMapping({
  assertTrue,
  registry,
}) {
  const qualityManifestSource = selectAffectedGates(registry, ['scripts/lib/quality/quality-manifest.mjs']);
  assertTrue(qualityManifestSource.names.includes('verify:quality-runner:manifest'), 'quality manifest source should select manifest self-check slice');
  assertTrue(!qualityManifestSource.names.includes('verify:quality-runner:hook'), 'quality manifest source should not select unrelated hook slice');

  const manifestSliceCheck = selectAffectedGates(registry, ['scripts/checks/quality-runner/manifest.mjs']);
  assertTrue(manifestSliceCheck.names.includes('verify:quality-runner:manifest'), 'manifest self-check source should select manifest slice');
  assertTrue(!manifestSliceCheck.names.includes('verify:quality-runner:cache-local'), 'manifest self-check source should not fan out to local cache slice');
  assertTrue(!manifestSliceCheck.names.includes('verify:quality-runner:hook'), 'manifest self-check source should not fan out to hook slice');
}
