import {
  selectAffectedGates,
} from '../../lib/quality/quality-affected.mjs';
import {
  SCHEDULER_SLICE_GATES,
} from './affected-mapping-scheduler-fixtures.mjs';

export function assertQualityRunnerAffectedSourceMapping({
  assertExcludesAll,
  assertTrue,
  registry,
}) {
  const qualityAffected = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected.mjs']);
  assertTrue(qualityAffected.names.includes('verify:quality-runner:affected-mapping'), 'quality affected source should select affected mapping self-check slice');
  assertTrue(qualityAffected.names.includes('verify:quality-runner:affected-mode'), 'quality affected source should select affected mode self-check slice');
  assertTrue(qualityAffected.names.includes('verify:quality-runner:affected-explain'), 'quality affected source should select affected explain self-check slice');
  assertTrue(qualityAffected.names.includes('verify:quality-runner:affected-runtime-status'), 'quality affected source should select affected runtime status self-check slice');
  assertTrue(qualityAffected.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected source should select affected runtime env self-check slice');
  assertTrue(qualityAffected.names.includes('verify:quality-runner:affected-files'), 'quality affected source should select affected files self-check slice');
  assertTrue(qualityAffected.names.includes('verify:quality-runner:prepush'), 'quality affected source should select prepush mode self-check slice');
  assertTrue(!qualityAffected.names.includes('verify:quality-runner:cache-local'), 'quality affected source should not select unrelated cache slice');

  const qualityAffectedFiles = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-files.mjs']);
  assertTrue(qualityAffectedFiles.names.includes('verify:quality-runner:affected-mapping'), 'quality affected files source should select affected mapping self-check slice');
  assertTrue(qualityAffectedFiles.names.includes('verify:quality-runner:affected-mode'), 'quality affected files source should select affected mode self-check slice');
  assertTrue(qualityAffectedFiles.names.includes('verify:quality-runner:affected-explain'), 'quality affected files source should select affected explain self-check slice');
  assertTrue(qualityAffectedFiles.names.includes('verify:quality-runner:affected-runtime-status'), 'quality affected files source should select affected runtime status self-check slice');
  assertTrue(qualityAffectedFiles.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected files source should select affected runtime env self-check slice');
  assertTrue(qualityAffectedFiles.names.includes('verify:quality-runner:affected-files'), 'quality affected files source should select affected files self-check slice');
  assertTrue(qualityAffectedFiles.names.includes('verify:quality-runner:prepush'), 'quality affected files source should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedFiles.names, SCHEDULER_SLICE_GATES, 'quality affected files source should not select scheduler self-check slice');

  const qualityChangedFileEntries = selectAffectedGates(registry, ['scripts/lib/quality/quality-changed-file-entries.mjs']);
  assertTrue(qualityChangedFileEntries.names.includes('verify:quality-runner:affected-files'), 'quality changed-file entry helper should select affected files self-check slice');
  assertTrue(qualityChangedFileEntries.names.includes('verify:quality-runner:affected-runtime-status'), 'quality changed-file entry helper should select affected runtime status slice');
  assertTrue(qualityChangedFileEntries.names.includes('verify:quality-runner:prepush'), 'quality changed-file entry helper should select prepush mode self-check slice');
  assertExcludesAll(qualityChangedFileEntries.names, SCHEDULER_SLICE_GATES, 'quality changed-file entry helper should not select scheduler self-check slice');

  const qualityAffectedFrontendBuildRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-frontend-build-rules.mjs']);
  assertTrue(qualityAffectedFrontendBuildRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected frontend build rules should select affected mapping self-check slice');
  assertTrue(qualityAffectedFrontendBuildRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected frontend build rules should select affected mode self-check slice');
  assertTrue(qualityAffectedFrontendBuildRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected frontend build rules should select affected explain self-check slice');
  assertTrue(qualityAffectedFrontendBuildRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected frontend build rules should select affected runtime env self-check slice');
  assertTrue(qualityAffectedFrontendBuildRules.names.includes('verify:quality-runner:prepush'), 'quality affected frontend build rules should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedFrontendBuildRules.names, SCHEDULER_SLICE_GATES, 'quality affected frontend build rules should not select scheduler self-check slice');

  const qualityAffectedFrontendSourceRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-frontend-source-rules.mjs']);
  assertTrue(qualityAffectedFrontendSourceRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected frontend source rules should select affected mapping self-check slice');
  assertTrue(qualityAffectedFrontendSourceRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected frontend source rules should select affected mode self-check slice');
  assertTrue(qualityAffectedFrontendSourceRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected frontend source rules should select affected explain self-check slice');
  assertTrue(qualityAffectedFrontendSourceRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected frontend source rules should select affected runtime env self-check slice');
  assertTrue(qualityAffectedFrontendSourceRules.names.includes('verify:quality-runner:prepush'), 'quality affected frontend source rules should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedFrontendSourceRules.names, SCHEDULER_SLICE_GATES, 'quality affected frontend source rules should not select scheduler self-check slice');

  const qualityAffectedPackageDiff = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-package-diff.mjs']);
  assertTrue(qualityAffectedPackageDiff.names.includes('verify:quality-runner:affected-mapping'), 'quality affected package diff source should select affected mapping self-check slice');
  assertTrue(qualityAffectedPackageDiff.names.includes('verify:quality-runner:affected-files'), 'quality affected package diff source should select affected files self-check slice');
  assertTrue(qualityAffectedPackageDiff.names.includes('verify:quality-runner:prepush'), 'quality affected package diff source should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedPackageDiff.names, SCHEDULER_SLICE_GATES, 'quality affected package diff source should not select scheduler self-check slice');

  const qualityAffectedPackageRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-package-rules.mjs']);
  assertTrue(qualityAffectedPackageRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected package rules source should select affected mapping self-check slice');
  assertTrue(qualityAffectedPackageRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected package rules source should select affected mode self-check slice');
  assertTrue(qualityAffectedPackageRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected package rules source should select affected explain self-check slice');
  assertTrue(qualityAffectedPackageRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected package rules source should select affected runtime env self-check slice');
  assertTrue(qualityAffectedPackageRules.names.includes('verify:quality-runner:prepush'), 'quality affected package rules source should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedPackageRules.names, SCHEDULER_SLICE_GATES, 'quality affected package rules source should not select scheduler self-check slice');

  const qualityAffectedSelection = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-selection.mjs']);
  assertTrue(qualityAffectedSelection.names.includes('verify:quality-runner:affected-mapping'), 'quality affected selection source should select affected mapping self-check slice');
  assertTrue(qualityAffectedSelection.names.includes('verify:quality-runner:affected-mode'), 'quality affected selection source should select affected mode self-check slice');
  assertTrue(qualityAffectedSelection.names.includes('verify:quality-runner:affected-explain'), 'quality affected selection source should select affected explain self-check slice');
  assertTrue(qualityAffectedSelection.names.includes('verify:quality-runner:affected-runtime-status'), 'quality affected selection source should select affected runtime status self-check slice');
  assertTrue(qualityAffectedSelection.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected selection source should select affected runtime env self-check slice');
  assertTrue(qualityAffectedSelection.names.includes('verify:quality-runner:affected-files'), 'quality affected selection source should select affected files self-check slice');
  assertTrue(qualityAffectedSelection.names.includes('verify:quality-runner:prepush'), 'quality affected selection source should select prepush mode self-check slice');
  assertTrue(!qualityAffectedSelection.names.includes('verify:quality-runner:manifest'), 'quality affected selection source should not select manifest self-check slice');

  const qualityAffectedPathRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-path-rules.mjs']);
  assertTrue(qualityAffectedPathRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected path rules helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedPathRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected path rules helper should select affected mode self-check slice');
  assertTrue(qualityAffectedPathRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected path rules helper should select affected explain self-check slice');
  assertTrue(qualityAffectedPathRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected path rules helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedPathRules.names.includes('verify:quality-runner:prepush'), 'quality affected path rules helper should select prepush mode self-check slice');
  assertTrue(!qualityAffectedPathRules.names.includes('verify:quality-runner:manifest'), 'quality affected path rules helper should not select manifest self-check slice');

  const qualityAffectedRepoConfigRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-repo-config-rules.mjs']);
  assertTrue(qualityAffectedRepoConfigRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected repo config rules helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedRepoConfigRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected repo config rules helper should select affected mode self-check slice');
  assertTrue(qualityAffectedRepoConfigRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected repo config rules helper should select affected explain self-check slice');
  assertTrue(qualityAffectedRepoConfigRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected repo config rules helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedRepoConfigRules.names.includes('verify:quality-runner:prepush'), 'quality affected repo config rules helper should select prepush mode self-check slice');
  assertTrue(!qualityAffectedRepoConfigRules.names.includes('verify:quality-runner:manifest'), 'quality affected repo config rules helper should not select manifest self-check slice');

  const qualityAffectedSourceBoundaryRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-source-boundary-rules.mjs']);
  assertTrue(qualityAffectedSourceBoundaryRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected source boundary rules helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedSourceBoundaryRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected source boundary rules helper should select affected mode self-check slice');
  assertTrue(qualityAffectedSourceBoundaryRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected source boundary rules helper should select affected explain self-check slice');
  assertTrue(qualityAffectedSourceBoundaryRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected source boundary rules helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedSourceBoundaryRules.names.includes('verify:quality-runner:prepush'), 'quality affected source boundary rules helper should select prepush mode self-check slice');
  assertTrue(!qualityAffectedSourceBoundaryRules.names.includes('verify:quality-runner:manifest'), 'quality affected source boundary rules helper should not select manifest self-check slice');

  const qualityAffectedScripts = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-scripts.mjs']);
  assertTrue(qualityAffectedScripts.names.includes('verify:quality-runner:affected-mapping'), 'quality affected script rules source should select affected mapping self-check slice');
  assertTrue(qualityAffectedScripts.names.includes('verify:quality-runner:affected-mode'), 'quality affected script rules source should select affected mode self-check slice');
  assertTrue(qualityAffectedScripts.names.includes('verify:quality-runner:affected-explain'), 'quality affected script rules source should select affected explain self-check slice');
  assertTrue(qualityAffectedScripts.names.includes('verify:quality-runner:affected-runtime-status'), 'quality affected script rules source should select affected runtime status self-check slice');
  assertTrue(qualityAffectedScripts.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected script rules source should select affected runtime env self-check slice');
  assertTrue(qualityAffectedScripts.names.includes('verify:quality-runner:affected-files'), 'quality affected script rules source should select affected files self-check slice');
  assertTrue(qualityAffectedScripts.names.includes('verify:quality-runner:prepush'), 'quality affected script rules source should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedScripts.names, SCHEDULER_SLICE_GATES, 'quality affected script rules source should not select scheduler self-check slice');

  const qualityAffectedCheckScriptRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-check-script-rules.mjs']);
  assertTrue(qualityAffectedCheckScriptRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected check script rules source should select affected mapping self-check slice');
  assertTrue(qualityAffectedCheckScriptRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected check script rules source should select affected mode self-check slice');
  assertTrue(qualityAffectedCheckScriptRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected check script rules source should select affected explain self-check slice');
  assertTrue(qualityAffectedCheckScriptRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected check script rules source should select affected runtime env self-check slice');
  assertTrue(qualityAffectedCheckScriptRules.names.includes('verify:quality-runner:prepush'), 'quality affected check script rules source should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedCheckScriptRules.names, SCHEDULER_SLICE_GATES, 'quality affected check script rules source should not select scheduler self-check slice');

  const qualityAffectedCreatorLibraryRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-creator-library-rules.mjs']);
  assertTrue(qualityAffectedCreatorLibraryRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected creator-library rule helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedCreatorLibraryRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected creator-library rule helper should select affected mode self-check slice');
  assertTrue(qualityAffectedCreatorLibraryRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected creator-library rule helper should select affected explain self-check slice');
  assertTrue(qualityAffectedCreatorLibraryRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected creator-library rule helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedCreatorLibraryRules.names.includes('verify:quality-runner:prepush'), 'quality affected creator-library rule helper should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedCreatorLibraryRules.names, SCHEDULER_SLICE_GATES, 'quality affected creator-library rule helper should not select scheduler self-check slice');

  const qualityAffectedDocRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-doc-rules.mjs']);
  assertTrue(qualityAffectedDocRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected docs rule helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedDocRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected docs rule helper should select affected mode self-check slice');
  assertTrue(qualityAffectedDocRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected docs rule helper should select affected explain self-check slice');
  assertTrue(qualityAffectedDocRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected docs rule helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedDocRules.names.includes('verify:quality-runner:prepush'), 'quality affected docs rule helper should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedDocRules.names, SCHEDULER_SLICE_GATES, 'quality affected docs rule helper should not select scheduler self-check slice');

  const qualityAffectedDeployRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-deploy-rules.mjs']);
  assertTrue(qualityAffectedDeployRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected deploy rule helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedDeployRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected deploy rule helper should select affected mode self-check slice');
  assertTrue(qualityAffectedDeployRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected deploy rule helper should select affected explain self-check slice');
  assertTrue(qualityAffectedDeployRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected deploy rule helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedDeployRules.names.includes('verify:quality-runner:prepush'), 'quality affected deploy rule helper should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedDeployRules.names, SCHEDULER_SLICE_GATES, 'quality affected deploy rule helper should not select scheduler self-check slice');

  const qualityAffectedExplain = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-explain.mjs']);
  assertTrue(qualityAffectedExplain.names.includes('verify:quality-runner:affected-mapping'), 'quality affected explain helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedExplain.names.includes('verify:quality-runner:affected-mode'), 'quality affected explain helper should select affected mode self-check slice');
  assertTrue(qualityAffectedExplain.names.includes('verify:quality-runner:affected-explain'), 'quality affected explain helper should select affected explain self-check slice');
  assertTrue(qualityAffectedExplain.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected explain helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedExplain.names.includes('verify:quality-runner:prepush'), 'quality affected explain helper should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedExplain.names, SCHEDULER_SLICE_GATES, 'quality affected explain helper should not select scheduler self-check slice');

  const qualityAffectedFallbackRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-fallback-rules.mjs']);
  assertTrue(qualityAffectedFallbackRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected fallback rule helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedFallbackRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected fallback rule helper should select affected mode self-check slice');
  assertTrue(qualityAffectedFallbackRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected fallback rule helper should select affected explain self-check slice');
  assertTrue(qualityAffectedFallbackRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected fallback rule helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedFallbackRules.names.includes('verify:quality-runner:prepush'), 'quality affected fallback rule helper should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedFallbackRules.names, SCHEDULER_SLICE_GATES, 'quality affected fallback rule helper should not select scheduler self-check slice');

  const qualityAffectedFrontendVendorRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-frontend-vendor-rules.mjs']);
  assertTrue(qualityAffectedFrontendVendorRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected frontend vendor rule helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedFrontendVendorRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected frontend vendor rule helper should select affected mode self-check slice');
  assertTrue(qualityAffectedFrontendVendorRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected frontend vendor rule helper should select affected explain self-check slice');
  assertTrue(qualityAffectedFrontendVendorRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected frontend vendor rule helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedFrontendVendorRules.names.includes('verify:quality-runner:prepush'), 'quality affected frontend vendor rule helper should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedFrontendVendorRules.names, SCHEDULER_SLICE_GATES, 'quality affected frontend vendor rule helper should not select scheduler self-check slice');

  const qualityAffectedSelectionUtils = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-selection-utils.mjs']);
  assertTrue(qualityAffectedSelectionUtils.names.includes('verify:quality-runner:affected-mapping'), 'quality affected selection helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedSelectionUtils.names.includes('verify:quality-runner:affected-mode'), 'quality affected selection helper should select affected mode self-check slice');
  assertTrue(qualityAffectedSelectionUtils.names.includes('verify:quality-runner:affected-explain'), 'quality affected selection helper should select affected explain self-check slice');
  assertTrue(qualityAffectedSelectionUtils.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected selection helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedSelectionUtils.names.includes('verify:quality-runner:prepush'), 'quality affected selection helper should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedSelectionUtils.names, SCHEDULER_SLICE_GATES, 'quality affected selection helper should not select scheduler self-check slice');

  const qualityAffectedCheckScriptRuleUtils = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-check-script-rule-utils.mjs']);
  assertTrue(qualityAffectedCheckScriptRuleUtils.names.includes('verify:quality-runner:affected-mapping'), 'quality affected check script rule helper should select affected mapping self-check slice');
  assertTrue(qualityAffectedCheckScriptRuleUtils.names.includes('verify:quality-runner:affected-mode'), 'quality affected check script rule helper should select affected mode self-check slice');
  assertTrue(qualityAffectedCheckScriptRuleUtils.names.includes('verify:quality-runner:affected-explain'), 'quality affected check script rule helper should select affected explain self-check slice');
  assertTrue(qualityAffectedCheckScriptRuleUtils.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected check script rule helper should select affected runtime env self-check slice');
  assertTrue(qualityAffectedCheckScriptRuleUtils.names.includes('verify:quality-runner:prepush'), 'quality affected check script rule helper should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedCheckScriptRuleUtils.names, SCHEDULER_SLICE_GATES, 'quality affected check script rule helper should not select scheduler self-check slice');

  const qualityAffectedFrontendCheckScriptRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-frontend-check-script-rules.mjs']);
  assertTrue(qualityAffectedFrontendCheckScriptRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected frontend check script rules should select affected mapping self-check slice');
  assertTrue(qualityAffectedFrontendCheckScriptRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected frontend check script rules should select affected mode self-check slice');
  assertTrue(qualityAffectedFrontendCheckScriptRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected frontend check script rules should select affected explain self-check slice');
  assertTrue(qualityAffectedFrontendCheckScriptRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected frontend check script rules should select affected runtime env self-check slice');
  assertTrue(qualityAffectedFrontendCheckScriptRules.names.includes('verify:quality-runner:prepush'), 'quality affected frontend check script rules should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedFrontendCheckScriptRules.names, SCHEDULER_SLICE_GATES, 'quality affected frontend check script rules should not select scheduler self-check slice');

  const qualityAffectedDesignCheckScriptRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-design-check-script-rules.mjs']);
  assertTrue(qualityAffectedDesignCheckScriptRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected design check script rules should select affected mapping self-check slice');
  assertTrue(qualityAffectedDesignCheckScriptRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected design check script rules should select affected mode self-check slice');
  assertTrue(qualityAffectedDesignCheckScriptRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected design check script rules should select affected explain self-check slice');
  assertTrue(qualityAffectedDesignCheckScriptRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected design check script rules should select affected runtime env self-check slice');
  assertTrue(qualityAffectedDesignCheckScriptRules.names.includes('verify:quality-runner:prepush'), 'quality affected design check script rules should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedDesignCheckScriptRules.names, SCHEDULER_SLICE_GATES, 'quality affected design check script rules should not select scheduler self-check slice');

  const qualityAffectedPlatformCheckScriptRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-affected-platform-check-script-rules.mjs']);
  assertTrue(qualityAffectedPlatformCheckScriptRules.names.includes('verify:quality-runner:affected-mapping'), 'quality affected platform check script rules should select affected mapping self-check slice');
  assertTrue(qualityAffectedPlatformCheckScriptRules.names.includes('verify:quality-runner:affected-mode'), 'quality affected platform check script rules should select affected mode self-check slice');
  assertTrue(qualityAffectedPlatformCheckScriptRules.names.includes('verify:quality-runner:affected-explain'), 'quality affected platform check script rules should select affected explain self-check slice');
  assertTrue(qualityAffectedPlatformCheckScriptRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality affected platform check script rules should select affected runtime env self-check slice');
  assertTrue(qualityAffectedPlatformCheckScriptRules.names.includes('verify:quality-runner:prepush'), 'quality affected platform check script rules should select prepush mode self-check slice');
  assertExcludesAll(qualityAffectedPlatformCheckScriptRules.names, SCHEDULER_SLICE_GATES, 'quality affected platform check script rules should not select scheduler self-check slice');

  const qualityRunnerAffectedScriptRules = selectAffectedGates(registry, ['scripts/lib/quality/quality-runner-affected-script-rules.mjs']);
  assertTrue(qualityRunnerAffectedScriptRules.names.includes('verify:quality-runner:affected-mapping'), 'quality runner affected script rules helper should select affected mapping self-check slice');
  assertTrue(qualityRunnerAffectedScriptRules.names.includes('verify:quality-runner:affected-mode'), 'quality runner affected script rules helper should select affected mode self-check slice');
  assertTrue(qualityRunnerAffectedScriptRules.names.includes('verify:quality-runner:affected-explain'), 'quality runner affected script rules helper should select affected explain self-check slice');
  assertTrue(qualityRunnerAffectedScriptRules.names.includes('verify:quality-runner:affected-runtime-env'), 'quality runner affected script rules helper should select affected runtime env self-check slice');
  assertTrue(qualityRunnerAffectedScriptRules.names.includes('verify:quality-runner:prepush'), 'quality runner affected script rules helper should select prepush mode self-check slice');
  assertExcludesAll(qualityRunnerAffectedScriptRules.names, SCHEDULER_SLICE_GATES, 'quality runner affected script rules helper should not select scheduler self-check slice');
}
