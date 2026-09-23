#!/usr/bin/env node

/**
 * Route policy registry structural audit.
 *
 * Runtime auth-navigation now denies unknown routes, so the route-policy
 * registry itself must stay structurally sound: no duplicate paths, aliases
 * must describe real redirect/prefix surfaces, public parents must not
 * accidentally shadow protected children, and aliases must not drift from the
 * kind of their protected descendants.
 */

import {
  assertRepoRoot,
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  ROUTE_POLICY_REGISTRY_STRUCTURE_GUARD_NAME,
  auditRoutePolicyRegistryStructure,
  formatRoutePolicyRegistryStructureFailure,
  summarizeRoutePolicyRegistryStructure,
} from '../../lib/frontend/route-policy-registry-structure-core.mjs';

export {
  ROUTE_POLICY_REGISTRY_FILE,
  ROUTE_POLICY_GOVERNANCE_FILE,
  ROUTE_POLICY_REGISTRY_STRUCTURE_GUARD_NAME,
  VITE_ROUTES_FILE,
  auditRoutePolicyRegistryStructure,
  collectRoutePolicyRegistryStructureFindings,
  formatRoutePolicyRegistryStructureFailure,
  groupByNormalizedRoutePolicyPath,
  isPrefixRoutePolicyPath,
  routePolicyEntryLabel,
  summarizeRoutePolicyRegistryStructure,
  unresolvedViteRouteFindings,
} from '../../lib/frontend/route-policy-registry-structure-core.mjs';

const { fail, reportOk } = createCheckGuard(ROUTE_POLICY_REGISTRY_STRUCTURE_GUARD_NAME);

async function main() {
  const repoRoot = getRepoRoot();
  assertRepoRoot(repoRoot, fail);

  const result = await auditRoutePolicyRegistryStructure(repoRoot);
  if (result.findings.length > 0) {
    console.error(formatRoutePolicyRegistryStructureFailure(result.findings));
    process.exit(1);
  }

  reportOk(summarizeRoutePolicyRegistryStructure(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
