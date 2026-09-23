/**
 * Helpers for reading the Vite React Router registry.
 *
 * The route registry is intentionally allowed to use ROUTE_PATHS constants so
 * route-policy, Layout navigation, and runtime routes do not drift apart.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROUTE_PATHS_FILE = 'apps/web-vite/src/lib/route-policy-registry.ts';
const ROUTE_PATHS_BLOCK_PATTERN =
  /export\s+const\s+ROUTE_PATHS\s*=\s*\{([\s\S]*?)\}\s*as\s+const/;
const ROUTE_PATH_ENTRY_PATTERN = /([A-Za-z_$][\w$]*)\s*:\s*(['"])(.*?)\2/g;

function lineNumberForIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}

export function parseRoutePathsObject(source) {
  const blockMatch = ROUTE_PATHS_BLOCK_PATTERN.exec(source);
  if (!blockMatch) {
    return {};
  }

  const routePaths = {};
  ROUTE_PATH_ENTRY_PATTERN.lastIndex = 0;

  let match;
  while ((match = ROUTE_PATH_ENTRY_PATTERN.exec(blockMatch[1])) !== null) {
    routePaths[match[1]] = match[3];
  }

  return routePaths;
}

export function loadRoutePaths(repoRoot, filePath = ROUTE_PATHS_FILE) {
  const fullPath = path.join(repoRoot, filePath);
  if (!existsSync(fullPath)) {
    return {};
  }

  return parseRoutePathsObject(readFileSync(fullPath, 'utf8'));
}

export function resolveRoutePathExpression(expression, routePaths = {}) {
  const trimmed = expression.trim();
  const quotedMatch = /^(['"])(.*?)\1$/.exec(trimmed);
  if (quotedMatch) {
    return quotedMatch[2];
  }

  const constantMatch = /^ROUTE_PATHS\.([A-Za-z_$][\w$]*)$/.exec(trimmed);
  if (constantMatch) {
    return routePaths[constantMatch[1]] ?? null;
  }

  const templateMatch = /^`([\s\S]*)`$/.exec(trimmed);
  if (!templateMatch) {
    return null;
  }

  const missingKeys = [];
  const resolved = templateMatch[1].replace(
    /\$\{ROUTE_PATHS\.([A-Za-z_$][\w$]*)\}/g,
    (_match, key) => {
      const value = routePaths[key];
      if (typeof value !== 'string') {
        missingKeys.push(key);
        return '';
      }
      return value;
    },
  );

  if (missingKeys.length > 0 || resolved.includes('${')) {
    return null;
  }

  return resolved;
}

export function extractRoutePathExpression(source) {
  const literalMatch = /\bpath\s*=\s*(["'][^"']*["'])/.exec(source);
  if (literalMatch) {
    return literalMatch[1];
  }

  const templateMatch = /\bpath\s*=\s*\{(`[^`]*`)\}/.exec(source);
  if (templateMatch) {
    return templateMatch[1];
  }

  const constantMatch = /\bpath\s*=\s*\{(ROUTE_PATHS\.[A-Za-z_$][\w$]*)\}/.exec(source);
  if (constantMatch) {
    return constantMatch[1];
  }

  return null;
}

export function parseViteRoutePathReferences(source, routePaths = {}) {
  const references = [];
  const unresolved = [];
  const routeElementPattern = /<Route\b[\s\S]*?(?:\/>|>)/g;

  let match;
  while ((match = routeElementPattern.exec(source)) !== null) {
    const routeSource = match[0];
    const pathExpression = extractRoutePathExpression(routeSource);
    if (!pathExpression) {
      continue;
    }

    const resolvedPath = resolveRoutePathExpression(pathExpression, routePaths);
    const reference = {
      expression: pathExpression,
      line: lineNumberForIndex(source, match.index),
      lineSource: routeSource,
      path: resolvedPath,
    };

    if (!resolvedPath) {
      unresolved.push(reference);
    } else {
      references.push(reference);
    }

  }

  return { references, unresolved };
}

export function parseViteRoutePaths(source, routePaths = {}, options = {}) {
  const { includeWildcard = false } = options;
  const parsed = parseViteRoutePathReferences(source, routePaths);
  const paths = new Set(
    parsed.references
      .map((reference) => reference.path)
      .filter((routePath) => routePath && (includeWildcard || routePath !== '*')),
  );

  return {
    paths,
    references: parsed.references,
    unresolved: parsed.unresolved,
  };
}
