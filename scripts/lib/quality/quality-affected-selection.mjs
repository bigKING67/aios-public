import {
  allowlistConfigAffectedRule,
} from './quality-allowlist-affected-gates.mjs';
import {
  isIgnoredAffectedFile,
  packageJsonChangeKind,
  packageLockChangeKind,
} from './quality-affected-files.mjs';
import {
  applyScriptAffectedRule,
} from './quality-affected-scripts.mjs';
import {
  packageAffectedRule,
} from './quality-affected-package-rules.mjs';
import {
  applyFrontendSourceAffectedRuleForFile,
} from './quality-affected-frontend-source-rules.mjs';
import {
  frontendBuildAffectedRule,
} from './quality-affected-frontend-build-rules.mjs';
import {
  repoConfigAffectedRule,
} from './quality-affected-repo-config-rules.mjs';
import {
  sourceBoundaryAffectedRule,
  sourceSizeGovernanceAffectedRule,
} from './quality-affected-source-boundary-rules.mjs';
import {
  docsAffectedRule,
} from './quality-affected-doc-rules.mjs';
import {
  frontendVendorAffectedRule,
} from './quality-affected-frontend-vendor-rules.mjs';
import {
  deployAffectedRule,
} from './quality-affected-deploy-rules.mjs';
import {
  creatorLibraryAffectedRule,
} from './quality-affected-creator-library-rules.mjs';
import {
  noChangedFilesFallbackRule,
  unknownPathFallbackRule,
} from './quality-affected-fallback-rules.mjs';
import {
  addNames,
  applyRule,
  gatesByPredicate,
  sortAffectedReasons,
} from './quality-affected-selection-utils.mjs';

export function selectAffectedGates(registry, changedFiles, options = {}) {
  const {
    base,
    head = null,
    includeReasons = true,
    packageJsonRequiresFullCi = null,
    packageJsonKind = packageJsonChangeKind,
    packageLockRequiresFullCi = null,
    packageLockKind = packageLockChangeKind,
    repoRoot = process.cwd(),
  } = options;
  const selected = new Map();
  const allCiNames = new Set(registry.ciGateNames);
  const weekly = gatesByPredicate(registry, (gate) => gate.group === 'weekly');

  const noChangedFilesRule = noChangedFilesFallbackRule(changedFiles);
  if (noChangedFilesRule) {
    addNames(selected, noChangedFilesRule.gates, noChangedFilesRule.reason);
  }

  for (const file of changedFiles) {
    if (isIgnoredAffectedFile(file)) {
      continue;
    }

    const sourceSizeRule = sourceSizeGovernanceAffectedRule(file);
    if (sourceSizeRule) {
      addNames(selected, sourceSizeRule.gates, sourceSizeRule.reason);
    }

    const creatorLibraryRule = creatorLibraryAffectedRule(file);
    if (creatorLibraryRule) {
      addNames(selected, creatorLibraryRule.gates, creatorLibraryRule.reason);
    }

    const allowlistRule = allowlistConfigAffectedRule(file);
    if (allowlistRule) {
      addNames(selected, allowlistRule.gates, allowlistRule.reason);
      continue;
    }

    const deployRule = deployAffectedRule(file);
    if (deployRule) {
      addNames(selected, deployRule.gates, deployRule.reason);
      continue;
    }

    const repoConfigRule = repoConfigAffectedRule(file);
    if (repoConfigRule) {
      addNames(selected, repoConfigRule.gates, repoConfigRule.reason);
      continue;
    }

    if (applyScriptAffectedRule(selected, registry, file, { weekly })) {
      continue;
    }

    const sourceBoundaryRule = sourceBoundaryAffectedRule(file);
    if (sourceBoundaryRule && applyRule(selected, sourceBoundaryRule)) {
      continue;
    }

    const packageRule = packageAffectedRule({
      allCiNames,
      base,
      file,
      head,
      packageJsonKind,
      packageJsonRequiresFullCi,
      packageLockKind,
      packageLockRequiresFullCi,
      repoRoot,
    });
    if (packageRule) {
      addNames(selected, packageRule.gates, packageRule.reason);
      continue;
    }

    const frontendBuildRule = frontendBuildAffectedRule(file);
    if (frontendBuildRule) {
      addNames(selected, frontendBuildRule.gates, frontendBuildRule.reason);
      continue;
    }

    const docsRule = docsAffectedRule(file);
    if (docsRule) {
      addNames(selected, docsRule.gates, docsRule.reason);
      continue;
    }

    if (applyFrontendSourceAffectedRuleForFile(selected, file, weekly)) {
      continue;
    }

    const frontendVendorRule = frontendVendorAffectedRule(file);
    if (frontendVendorRule) {
      addNames(selected, frontendVendorRule.gates, frontendVendorRule.reason);
      continue;
    }

    const fallbackRule = unknownPathFallbackRule(file);
    addNames(selected, fallbackRule.gates, fallbackRule.reason);
  }

  const names = [...selected.keys()].filter((name) => registry.byName.has(name));
  if (includeReasons) {
    const reasons = Object.fromEntries(
      [...selected.entries()]
        .filter(([name]) => registry.byName.has(name))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, gateReasons]) => [name, sortAffectedReasons(gateReasons)]),
    );
    return {
      names,
      reasons,
    };
  }
  return { names };
}
