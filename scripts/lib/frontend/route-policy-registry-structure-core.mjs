import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

import {
  isAppPageFile,
  routePathForPageFile,
} from './app-route-paths.mjs';
import {
  loadRoutePaths,
  parseViteRoutePaths,
} from './vite-route-paths.mjs';

export const ROUTE_POLICY_REGISTRY_STRUCTURE_GUARD_NAME = 'route-policy-registry-structure';
export const ROUTE_POLICY_REGISTRY_FILE = 'apps/web-vite/src/lib/route-policy-registry.ts';
export const ROUTE_POLICY_GOVERNANCE_FILE = 'apps/web-vite/src/lib/route-policy-governance.ts';
export const VITE_ROUTES_FILE = 'apps/web-vite/src/routes.tsx';

export async function bundleRoutePolicyRegistry(repoRoot) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'aios-route-policy-structure-'));
  const outputFile = path.join(tempDir, 'route-policy-registry.mjs');

  await build({
    absWorkingDir: repoRoot,
    bundle: true,
    entryPoints: [ROUTE_POLICY_GOVERNANCE_FILE],
    external: [],
    format: 'esm',
    logLevel: 'silent',
    outfile: outputFile,
    platform: 'node',
    target: 'node20',
  });

  return {
    cleanup: () => rmSync(tempDir, { force: true, recursive: true }),
    moduleUrl: pathToFileURL(outputFile).href,
  };
}

function readSource(repoRoot, filePath) {
  return readFileSync(path.join(repoRoot, filePath), 'utf8');
}

export function groupByNormalizedRoutePolicyPath(entries, normalizeRoutePolicyPath) {
  const groups = new Map();

  for (const entry of entries) {
    const normalizedPath = normalizeRoutePolicyPath(entry.path);
    const existing = groups.get(normalizedPath) ?? [];
    existing.push(entry);
    groups.set(normalizedPath, existing);
  }

  return groups;
}

export function routePolicyEntryLabel(entry) {
  return `${entry.path} (${entry.kind})`;
}

export function isPrefixRoutePolicyPath(parentPath, childPath) {
  return childPath !== parentPath && childPath.startsWith(`${parentPath}/`);
}

export function collectRoutePolicyRegistryStructureFindings(registry, viteRoutePaths) {
  const {
    PUBLIC_ROUTE_POLICY_ENTRIES,
    PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES,
    PROTECTED_ROUTE_POLICY_ENTRIES,
    PROTECTED_ROUTE_GOVERNANCE_ENTRIES,
    ROUTE_POLICY_ENTRIES,
    normalizeRoutePolicyPath,
  } = registry;
  const findings = [];
  const routeGroups = groupByNormalizedRoutePolicyPath(ROUTE_POLICY_ENTRIES, normalizeRoutePolicyPath);

  for (const [normalizedPath, entries] of routeGroups) {
    if (entries.length > 1) {
      findings.push(
        `${normalizedPath} is registered more than once: ${entries.map(routePolicyEntryLabel).join(', ')}`,
      );
    }
  }

  const protectedEntries = PROTECTED_ROUTE_POLICY_ENTRIES.map((entry) => ({
    ...entry,
    normalizedPath: normalizeRoutePolicyPath(entry.path),
  }));
  const aliasEntries = PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES.map((entry) => ({
    ...entry,
    normalizedPath: normalizeRoutePolicyPath(entry.path),
  }));
  const routePolicyPathSet = new Set(
    ROUTE_POLICY_ENTRIES.map((entry) => normalizeRoutePolicyPath(entry.path)),
  );
  const normalizedViteRoutePaths = [...viteRoutePaths].map((routePath) => normalizeRoutePolicyPath(routePath));
  const protectedGovernanceByPath = new Map(
    PROTECTED_ROUTE_GOVERNANCE_ENTRIES.map((entry) => [normalizeRoutePolicyPath(entry.path), entry]),
  );

  for (const entry of protectedEntries) {
    if (!protectedGovernanceByPath.has(entry.normalizedPath)) {
      findings.push(`${entry.path} protected policy entry is missing governance metadata.`);
    }
  }

  for (const entry of PROTECTED_ROUTE_GOVERNANCE_ENTRIES) {
    const normalizedPath = normalizeRoutePolicyPath(entry.path);
    if (!protectedEntries.some((policyEntry) => policyEntry.normalizedPath === normalizedPath)) {
      findings.push(`${entry.path} governance metadata has no protected policy entry.`);
    }
  }

  for (const entry of PROTECTED_ROUTE_GOVERNANCE_ENTRIES) {
    const normalizedPath = normalizeRoutePolicyPath(entry.path);
    if (!entry.page) {
      findings.push(`${entry.path} protected policy entry must include a page file.`);
      continue;
    }

    if (!isAppPageFile(entry.page)) {
      findings.push(`${entry.path} protected policy page must be a apps/web-vite/src/app page file: ${entry.page}.`);
      continue;
    }

    const pageRoutePath = normalizeRoutePolicyPath(routePathForPageFile(entry.page));
    if (pageRoutePath !== normalizedPath) {
      findings.push(`${entry.path} protected policy page ${entry.page} resolves to ${pageRoutePath}.`);
    }
  }

  for (const alias of aliasEntries) {
    const coveredChildren = protectedEntries.filter((entry) => (
      isPrefixRoutePolicyPath(alias.normalizedPath, entry.normalizedPath)
    ));
    const isRegisteredViteRoute = viteRoutePaths.has(alias.normalizedPath);

    if (!isRegisteredViteRoute && coveredChildren.length === 0) {
      findings.push(
        `${alias.path} alias must be a registered Vite route or a prefix of protected children.`,
      );
    }

    const mismatchedChildren = coveredChildren.filter((entry) => entry.kind !== alias.kind);
    for (const child of mismatchedChildren) {
      findings.push(
        `${alias.path} alias kind ${alias.kind} must match child ${child.path} kind ${child.kind}.`,
      );
    }
  }

  for (const publicEntry of PUBLIC_ROUTE_POLICY_ENTRIES) {
    const publicPath = normalizeRoutePolicyPath(publicEntry.path);
    if (publicPath === '/') {
      continue;
    }

    const protectedChildren = protectedEntries.filter((entry) => isPrefixRoutePolicyPath(publicPath, entry.normalizedPath));
    const registeredDescendantRoutes = normalizedViteRoutePaths.filter((routePath) => (
      isPrefixRoutePolicyPath(publicPath, routePath)
    ));

    for (const routePath of registeredDescendantRoutes) {
      const liesOnProtectedSubtree = protectedChildren.some((protectedChild) => (
        routePath === protectedChild.normalizedPath || isPrefixRoutePolicyPath(routePath, protectedChild.normalizedPath)
      ));
      if (liesOnProtectedSubtree && !routePolicyPathSet.has(routePath)) {
        findings.push(
          `${publicEntry.path} public policy would shadow descendant route ${routePath}; add an explicit protected or alias policy entry.`,
        );
      }
    }
  }

  return findings;
}

export function unresolvedViteRouteFindings(unresolvedReferences) {
  return unresolvedReferences.map((reference) => (
    `${VITE_ROUTES_FILE}:${reference.line} cannot resolve route path expression ${reference.expression}`
  ));
}

export async function auditRoutePolicyRegistryStructure(repoRoot) {
  const routesSource = readSource(repoRoot, VITE_ROUTES_FILE);
  const routePaths = loadRoutePaths(repoRoot);
  const parsedViteRoutes = parseViteRoutePaths(routesSource, routePaths);
  const viteRoutePaths = parsedViteRoutes.paths;
  const registryBundle = await bundleRoutePolicyRegistry(repoRoot);

  try {
    const registry = await import(`${registryBundle.moduleUrl}?cacheBust=${Date.now()}`);
    return {
      findings: [
        ...unresolvedViteRouteFindings(parsedViteRoutes.unresolved),
        ...collectRoutePolicyRegistryStructureFindings(registry, viteRoutePaths),
      ],
      registry,
      viteRoutePaths,
    };
  } finally {
    registryBundle.cleanup();
  }
}

export function formatRoutePolicyRegistryStructureFailure(findings) {
  return [
    `[${ROUTE_POLICY_REGISTRY_STRUCTURE_GUARD_NAME}] Route policy registry structure drift was detected:`,
    ...findings.map((finding) => `- ${finding}`),
    '',
    `Keep ${ROUTE_POLICY_REGISTRY_FILE} runtime policy and ${ROUTE_POLICY_GOVERNANCE_FILE} source ownership structurally consistent.`,
  ].join('\n');
}

export function summarizeRoutePolicyRegistryStructure(result) {
  return `${result.registry.ROUTE_POLICY_ENTRIES.length} route policy entries, `
    + `${result.registry.PROTECTED_ROUTE_POLICY_ALIAS_ENTRIES.length} aliases, `
    + `${result.viteRoutePaths.size} Vite route paths passed structural checks.`;
}
