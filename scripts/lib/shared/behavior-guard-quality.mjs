/**
 * Shared behavior-guard quality helpers.
 *
 * Behavior guards should assert behavior by executing the guarded script
 * against fixtures, or by using structural parsers. Plain source-snippet scans
 * are intentionally treated as fragile unless explicitly frozen as exceptions.
 */

import {
  DEFAULT_SOURCE_SCAN_PRIMITIVES,
  findSourceScanPrimitiveViolations,
  hasRuntimeBundle,
  hasStructuralParser,
  hasSubstantiveSourceAssertions,
} from './behavior-guard-classifiers.mjs';

export {
  DEFAULT_SOURCE_SCAN_PRIMITIVES,
  findSourceScanPrimitiveViolations,
  hasRuntimeBundle,
  hasStructuralParser,
  hasSubstantiveSourceAssertions,
} from './behavior-guard-classifiers.mjs';

export {
  hasCallExpression,
} from './behavior-guard-source-scan.mjs';

export function auditBehaviorGuardQuality({
  behaviorFiles,
  extraRuntimeDetectors = [],
  readSource,
  sourceOnlyExceptions = new Map(),
  sourceScanPrimitives = DEFAULT_SOURCE_SCAN_PRIMITIVES,
}) {
  const behaviorFileSet = new Set(behaviorFiles);
  const findings = [];
  let sourceOnlyCount = 0;
  let runtimeAndStructuralCount = 0;
  let runtimeOnlyCount = 0;
  let structuralOnlyCount = 0;

  for (const exceptionFile of sourceOnlyExceptions.keys()) {
    if (!behaviorFileSet.has(exceptionFile)) {
      findings.push(`source-only exception points at a missing behavior guard: ${exceptionFile}`);
    }
  }

  for (const behaviorFile of behaviorFiles) {
    const source = readSource(behaviorFile);
    const runtimeBacked = hasRuntimeBundle(source, { extraRuntimeDetectors });
    const parserBacked = hasStructuralParser(source);
    const sourceOnlyAllowed = sourceOnlyExceptions.has(behaviorFile);
    const sourceScanPrimitiveViolations = sourceOnlyAllowed
      ? []
      : findSourceScanPrimitiveViolations(source, sourceScanPrimitives);

    if (runtimeBacked && parserBacked) {
      runtimeAndStructuralCount += 1;
    } else if (runtimeBacked) {
      runtimeOnlyCount += 1;
    } else if (parserBacked) {
      structuralOnlyCount += 1;
    }

    if (sourceScanPrimitiveViolations.length > 0) {
      findings.push(
        `${behaviorFile} uses source-scan primitives; ${sourceScanPrimitiveViolations.join(' ')}`,
      );
    }
    if (!runtimeBacked && !parserBacked) {
      sourceOnlyCount += 1;
      if (!sourceOnlyAllowed) {
        findings.push(
          `${behaviorFile} is source-only; add a runtime fixture execution, a structural parser check, or a documented source-only exception`,
        );
      } else if (!hasSubstantiveSourceAssertions(source)) {
        findings.push(
          `${behaviorFile} is source-only but lacks both banned-snippet checks and positive render-contract assertions`,
        );
      }
    }
  }

  return {
    findings,
    sourceOnlyCount,
    runtimeAndStructuralCount,
    runtimeOnlyCount,
    structuralOnlyCount,
  };
}

export function reportBehaviorGuardQuality({
  behaviorFiles,
  failureFooter,
  failureHeader,
  guardName,
  reportOk,
  ...auditOptions
}) {
  const result = auditBehaviorGuardQuality({
    behaviorFiles,
    ...auditOptions,
  });

  if (result.findings.length > 0) {
    console.error(`[${guardName}] ${failureHeader}`);
    for (const finding of result.findings) {
      console.error(`- ${finding}`);
    }
    console.error(`\n${failureFooter}`);
    process.exit(1);
  }

  reportOk(
    `scanned ${behaviorFiles.length} behavior guards; runtime+structural ${result.runtimeAndStructuralCount}, runtime-only ${result.runtimeOnlyCount}, structural-only ${result.structuralOnlyCount}, source-only ${result.sourceOnlyCount}, documented source-only exceptions ${(auditOptions.sourceOnlyExceptions ?? new Map()).size}.`,
  );
}
