/**
 * Frontend layer boundary audit core.
 *
 * Shared infrastructure may be consumed upward by hooks/components/app routes,
 * but it must not depend back on UI state or route internals. Keep cross-layer
 * ownership explicit so low-level modules remain portable and testable.
 */

import path from 'node:path';
import ts from 'typescript';
import {
  lineNumberForOffset,
  listGitFiles,
  readRepoFile,
  toPosixPath,
} from '../shared/guard-utils.mjs';

export const FRONTEND_LAYER_BOUNDARY_GUARD_NAME = 'frontend-layer-boundaries';

const FRONTEND_SOURCE_ROOTS = Object.freeze(['apps/web-vite/src']);
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx)$/;

const RULES = Object.freeze([
  {
    name: 'lib must not depend on UI or state layers',
    sourcePrefixes: ['apps/web-vite/src/lib/'],
    blockedAliasPrefixes: ['@/app/', '@/components/', '@/context/', '@/hooks/', '@/stores/'],
    blockedTargetPrefixes: ['apps/web-vite/src/app/', 'apps/web-vite/src/components/', 'apps/web-vite/src/context/', 'apps/web-vite/src/hooks/', 'apps/web-vite/src/stores/'],
    suggestion:
      'Move UI/state integration into hooks/components, or inject a narrow bridge/callback from the app layer.',
  },
  {
    name: 'config/types/theme/styles must not depend on UI or state layers',
    sourcePrefixes: ['apps/web-vite/src/config/', 'apps/web-vite/src/styles/', 'apps/web-vite/src/theme/', 'apps/web-vite/src/types/'],
    blockedAliasPrefixes: ['@/app/', '@/components/', '@/context/', '@/hooks/', '@/stores/'],
    blockedTargetPrefixes: ['apps/web-vite/src/app/', 'apps/web-vite/src/components/', 'apps/web-vite/src/context/', 'apps/web-vite/src/hooks/', 'apps/web-vite/src/stores/'],
    suggestion:
      'Keep shared configuration, theme, styles, and types independent of route, component, hook, context, and store layers.',
  },
  {
    name: 'app shared route helpers are private to apps/web-vite/src/app',
    sourcePrefixes: [
      'apps/web-vite/src/components/',
      'apps/web-vite/src/config/',
      'apps/web-vite/src/context/',
      'apps/web-vite/src/hooks/',
      'apps/web-vite/src/lib/',
      'apps/web-vite/src/stores/',
      'apps/web-vite/src/styles/',
      'apps/web-vite/src/theme/',
      'apps/web-vite/src/types/',
      'apps/web-vite/src/App.tsx',
      'apps/web-vite/src/ViteProviders.tsx',
      'apps/web-vite/src/main.tsx',
      'apps/web-vite/src/routes.tsx',
    ],
    blockedAliasPrefixes: ['@/app/_shared/'],
    blockedTargetPrefixes: ['apps/web-vite/src/app/_shared/'],
    suggestion:
      'Keep apps/web-vite/src/app/_shared helpers inside route/page modules. Promote truly shared helpers to apps/web-vite/src/lib or apps/web-vite/src/hooks.',
  },
  {
    name: 'hooks must not depend on route-private modules',
    sourcePrefixes: ['apps/web-vite/src/hooks/'],
    blockedAliasPrefixes: ['@/app/'],
    blockedTargetPrefixes: ['apps/web-vite/src/app/'],
    suggestion:
      'Move route-specific logic into apps/web-vite/src/app, or promote reusable logic into apps/web-vite/src/lib or apps/web-vite/src/hooks explicitly.',
  },
  {
    name: 'shared components must not depend on route-private modules',
    sourcePrefixes: ['apps/web-vite/src/components/'],
    blockedAliasPrefixes: ['@/app/'],
    blockedTargetPrefixes: ['apps/web-vite/src/app/'],
    suggestion:
      'Move route-specific UI into its owning apps/web-vite/src/app module, or promote stable reusable contracts into shared modules.',
  },
  {
    name: 'Vite router must load app page modules instead of private route components',
    sourcePrefixes: ['apps/web-vite/src/routes.tsx'],
    blockedAliasPrefixes: ['@/app/'],
    blockedTargetPrefixes: ['apps/web-vite/src/app/'],
    blockedAliasIncludes: ['/_components/'],
    blockedTargetIncludes: ['/_components/'],
    suggestion:
      'Add or use the owning apps/web-vite/src/app/**/page module and keep _components private to that route/domain.',
  },
]);

export function listFrontendLayerBoundarySourceFiles(repoRoot) {
  return listGitFiles(FRONTEND_SOURCE_ROOTS, {
    cwd: repoRoot,
    filter: (file) => SOURCE_FILE_PATTERN.test(file),
  });
}

export function frontendLayerBoundarySourceKind(file) {
  if (file.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (file.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  return file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

export function createFrontendLayerBoundaryLineStartOffsets(sourceText) {
  const offsets = [0];
  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === '\n') {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

export function collectFrontendLayerBoundaryModuleSpecifiers(sourceFile) {
  const specifiers = [];

  function addModuleSpecifier(node) {
    if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push({
        node: node.moduleSpecifier,
        specifier: node.moduleSpecifier.text,
      });
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addModuleSpecifier(node);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push({
        node: node.arguments[0],
        specifier: node.arguments[0].text,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

export function matchingFrontendLayerBoundaryRulesForFile(file) {
  return RULES.filter((rule) =>
    rule.sourcePrefixes.some((sourcePrefix) => file.startsWith(sourcePrefix)),
  );
}

export function resolveFrontendLayerBoundaryRelativeImport(file, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  return toPosixPath(path.normalize(path.join(path.dirname(file), specifier)));
}

export function resolveFrontendLayerBoundaryBlockedPrefix(rule, file, specifier) {
  const blockedAliasPrefix = rule.blockedAliasPrefixes.find((prefix) => specifier.startsWith(prefix));
  if (blockedAliasPrefix && isBlockedByFrontendLayerBoundaryIncludes(rule.blockedAliasIncludes, specifier)) {
    return blockedAliasPrefix;
  }

  const relativeTarget = resolveFrontendLayerBoundaryRelativeImport(file, specifier);
  if (!relativeTarget) {
    return null;
  }

  return rule.blockedTargetPrefixes.find((prefix) => {
    if (!relativeTarget.startsWith(prefix)) {
      return false;
    }
    return isBlockedByFrontendLayerBoundaryIncludes(rule.blockedTargetIncludes, relativeTarget);
  }) ?? null;
}

export function isBlockedByFrontendLayerBoundaryIncludes(blockedIncludes, target) {
  if (!blockedIncludes || blockedIncludes.length === 0) {
    return true;
  }

  return blockedIncludes.some((blockedInclude) => target.includes(blockedInclude));
}

export function auditFrontendLayerBoundarySource(file, sourceText) {
  const rules = matchingFrontendLayerBoundaryRulesForFile(file);
  if (rules.length === 0) {
    return [];
  }

  const parsed = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, frontendLayerBoundarySourceKind(file));
  const lineStarts = createFrontendLayerBoundaryLineStartOffsets(sourceText);
  const findings = [];

  for (const { node, specifier } of collectFrontendLayerBoundaryModuleSpecifiers(parsed)) {
    for (const rule of rules) {
      const blockedPrefix = resolveFrontendLayerBoundaryBlockedPrefix(rule, file, specifier);
      if (!blockedPrefix) {
        continue;
      }

      findings.push({
        file,
        lineNumber: lineNumberForOffset(lineStarts, node.getStart(parsed)),
        specifier,
        ruleName: rule.name,
        blockedPrefix,
        suggestion: rule.suggestion,
      });
    }
  }

  return findings;
}

export function auditFrontendLayerBoundaryFile(repoRoot, file) {
  return auditFrontendLayerBoundarySource(file, readRepoFile(repoRoot, file));
}

export function runFrontendLayerBoundaryAudit(repoRoot) {
  const files = listFrontendLayerBoundarySourceFiles(repoRoot);
  const findings = files.flatMap((file) => auditFrontendLayerBoundaryFile(repoRoot, file));

  return {
    files,
    findings,
  };
}
