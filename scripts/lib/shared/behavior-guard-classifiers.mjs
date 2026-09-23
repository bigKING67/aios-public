import {
  hasCallExpression,
  hasCodeToken,
  hasProcessExecSpawn,
  hasSourceIncludesCall,
  importsOrRequires,
  stripCommentsAndStrings,
} from './behavior-guard-source-scan.mjs';

export const DEFAULT_SOURCE_SCAN_PRIMITIVES = [
  {
    name: 'readRepoFile',
    hasViolation: (source) => hasCallExpression(source, 'readRepoFile'),
    guidance: 'Use bundled/runtime execution or structural helpers instead of reading target source text.',
  },
  {
    name: 'bannedSnippets',
    hasViolation: (source) => hasCodeToken(source, 'bannedSnippets'),
    guidance: 'Use runtime behavior assertions or AST/JSX shape checks instead of banned snippet arrays.',
  },
  {
    name: 'requiredSnippets',
    hasViolation: (source) => hasCodeToken(source, 'requiredSnippets'),
    guidance: 'Use runtime behavior assertions or AST/JSX shape checks instead of required snippet arrays.',
  },
  {
    name: 'source.includes',
    hasViolation: (source) => hasSourceIncludesCall(source),
    guidance: 'Use structural parser helpers for source shape checks instead of source.includes(...).',
  },
];

function hasInProcessAuditFixture(source) {
  if (!importsOrRequires(source, (moduleName) => moduleName.startsWith('./') || moduleName.startsWith('../'))) {
    return false;
  }

  const codeOnlySource = stripCommentsAndStrings(source);
  return /\b(?:audit|check|compare|count|build|run)[A-Z][A-Za-z0-9_$]*\s*\(/.test(codeOnlySource);
}

export function hasRuntimeBundle(source, options = {}) {
  const { extraRuntimeDetectors = [] } = options;
  return (
    importsOrRequires(source, (moduleName) => moduleName === 'esbuild') ||
    hasCallExpression(source, 'importBundledWeeklyBehaviorEntry') ||
    hasProcessExecSpawn(source) ||
    hasInProcessAuditFixture(source) ||
    extraRuntimeDetectors.some((detector) => detector(source))
  );
}

export function hasStructuralParser(source) {
  return importsOrRequires(source, (moduleName) => (
    moduleName === 'typescript' ||
    moduleName === '@babel/parser' ||
    moduleName === 'acorn' ||
    moduleName === 'ts-morph' ||
    moduleName.includes('weekly-tsx-guard-utils') ||
    moduleName.includes('weekly/tsx-guard-utils')
  ));
}

export function hasSubstantiveSourceAssertions(source) {
  const hasBannedList = source.includes('bannedSnippets');
  const hasPositiveAssertion = (
    source.includes('requiredSnippets') ||
    /if\s*\(\s*![\s\S]{0,160}\.includes\(/m.test(source) ||
    /if\s*\(\s*![\s\S]{0,160}\.test\(/m.test(source)
  );

  return hasBannedList && hasPositiveAssertion;
}

export function findSourceScanPrimitiveViolations(source, sourceScanPrimitives) {
  return sourceScanPrimitives
    .filter((primitive) => primitive.hasViolation(source))
    .map((primitive) => `${primitive.name}: ${primitive.guidance}`);
}
