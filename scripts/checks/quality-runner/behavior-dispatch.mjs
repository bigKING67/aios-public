import {
  QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS,
  QUALITY_RUNNER_SLICE_DEFINITIONS,
} from '../../lib/quality/quality-runner-slices.mjs';
import {
  QUALITY_RUNNER_BEHAVIOR_DEFAULT_ORDER,
  QUALITY_RUNNER_BEHAVIOR_DISPATCH_ORDER,
  QUALITY_RUNNER_BEHAVIOR_DISPATCHER_SLICES,
  QUALITY_RUNNER_COMPAT_SLICE_CHILDREN,
  runQualityRunnerBehaviorDispatcher,
} from './behavior-dispatch-table.mjs';

export {
  QUALITY_RUNNER_BEHAVIOR_DEFAULT_ORDER,
  QUALITY_RUNNER_BEHAVIOR_DISPATCH_ORDER,
  QUALITY_RUNNER_COMPAT_SLICE_CHILDREN,
} from './behavior-dispatch-table.mjs';

function unique(values) {
  return [...new Set(values)];
}

function diffValues(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

export function qualityRunnerKnownBehaviorSlices() {
  return unique([
    ...QUALITY_RUNNER_SLICE_DEFINITIONS.map((definition) => definition.slice),
    ...QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS.map((definition) => definition.slice),
  ]).sort();
}

export function validateQualityRunnerBehaviorDispatch() {
  const findings = [];
  const primarySlices = QUALITY_RUNNER_SLICE_DEFINITIONS.map((definition) => definition.slice);
  const compatibilitySlices = QUALITY_RUNNER_COMPAT_SLICE_DEFINITIONS.map((definition) => definition.slice);
  const knownSlices = qualityRunnerKnownBehaviorSlices();
  const dispatchSlices = [...QUALITY_RUNNER_BEHAVIOR_DISPATCHER_SLICES];
  const dispatchOrder = [...QUALITY_RUNNER_BEHAVIOR_DISPATCH_ORDER];
  const defaultOrder = [...QUALITY_RUNNER_BEHAVIOR_DEFAULT_ORDER];

  const missingDispatchers = diffValues(knownSlices, dispatchSlices);
  if (missingDispatchers.length > 0) {
    findings.push(`behavior dispatch is missing slices: ${missingDispatchers.join(', ')}`);
  }
  const extraDispatchers = diffValues(dispatchSlices, knownSlices);
  if (extraDispatchers.length > 0) {
    findings.push(`behavior dispatch has unknown slices: ${extraDispatchers.join(', ')}`);
  }

  const duplicateDispatchOrder = dispatchOrder.filter((slice, index) => dispatchOrder.indexOf(slice) !== index);
  if (duplicateDispatchOrder.length > 0) {
    findings.push(`behavior dispatch order has duplicate slices: ${unique(duplicateDispatchOrder).join(', ')}`);
  }
  const missingOrder = diffValues(knownSlices, dispatchOrder);
  if (missingOrder.length > 0) {
    findings.push(`behavior dispatch order is missing slices: ${missingOrder.join(', ')}`);
  }
  const extraOrder = diffValues(dispatchOrder, knownSlices);
  if (extraOrder.length > 0) {
    findings.push(`behavior dispatch order has unknown slices: ${extraOrder.join(', ')}`);
  }

  const duplicateDefaultOrder = defaultOrder.filter((slice, index) => defaultOrder.indexOf(slice) !== index);
  if (duplicateDefaultOrder.length > 0) {
    findings.push(`behavior default order has duplicate slices: ${unique(duplicateDefaultOrder).join(', ')}`);
  }
  const extraDefaultOrder = diffValues(defaultOrder, knownSlices);
  if (extraDefaultOrder.length > 0) {
    findings.push(`behavior default order has unknown slices: ${extraDefaultOrder.join(', ')}`);
  }

  const childSlices = new Set();
  for (const [compatibilitySlice, children] of Object.entries(QUALITY_RUNNER_COMPAT_SLICE_CHILDREN)) {
    if (!compatibilitySlices.includes(compatibilitySlice)) {
      findings.push(`compatibility child map references unknown compatibility slice: ${compatibilitySlice}`);
    }
    if (children.length === 0) {
      findings.push(`compatibility slice ${compatibilitySlice} must include at least one child slice`);
    }
    for (const child of children) {
      if (!primarySlices.includes(child)) {
        findings.push(`compatibility slice ${compatibilitySlice} references non-primary child slice: ${child}`);
      }
      childSlices.add(child);
      if (defaultOrder.includes(compatibilitySlice) && defaultOrder.includes(child)) {
        findings.push(`behavior default order must not run both compatibility slice ${compatibilitySlice} and child slice ${child}`);
      }
    }
  }

  for (const compatibilitySlice of compatibilitySlices) {
    if (!Object.hasOwn(QUALITY_RUNNER_COMPAT_SLICE_CHILDREN, compatibilitySlice)) {
      findings.push(`compatibility slice ${compatibilitySlice} is missing child slice metadata`);
    }
  }

  const defaultPrimaryCoverage = new Set();
  for (const slice of defaultOrder) {
    if (primarySlices.includes(slice)) {
      defaultPrimaryCoverage.add(slice);
      continue;
    }
    for (const child of QUALITY_RUNNER_COMPAT_SLICE_CHILDREN[slice] ?? []) {
      defaultPrimaryCoverage.add(child);
    }
  }

  const missingDefaultPrimaryCoverage = diffValues(primarySlices, [...defaultPrimaryCoverage]);
  if (missingDefaultPrimaryCoverage.length > 0) {
    findings.push(`behavior default order does not cover primary slices: ${missingDefaultPrimaryCoverage.join(', ')}`);
  }
  const childlessPrimarySlices = primarySlices.filter((slice) => !defaultOrder.includes(slice) && !childSlices.has(slice));
  if (childlessPrimarySlices.length > 0) {
    findings.push(`primary slices are neither in default order nor covered by a compatibility slice: ${childlessPrimarySlices.join(', ')}`);
  }

  return findings;
}

export function parseRequestedSlices(argv) {
  const slices = new Set();
  const knownSlices = new Set(qualityRunnerKnownBehaviorSlices());
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--slice') {
      for (const slice of String(argv[++index] ?? '').split(',')) {
        if (slice) {
          slices.add(slice);
        }
      }
      continue;
    }
    throw new Error(`unknown quality-runner behavior argument: ${arg}`);
  }
  for (const slice of slices) {
    if (!knownSlices.has(slice)) {
      throw new Error(`unknown quality-runner behavior slice: ${slice}`);
    }
  }
  return slices;
}

export function slicesForRequestedBehaviorRun(requestedSlices) {
  if (requestedSlices.size === 0) {
    return [...QUALITY_RUNNER_BEHAVIOR_DEFAULT_ORDER];
  }

  const shadowedChildren = new Set();
  for (const [compatibilitySlice, children] of Object.entries(QUALITY_RUNNER_COMPAT_SLICE_CHILDREN)) {
    if (requestedSlices.has(compatibilitySlice)) {
      for (const child of children) {
        shadowedChildren.add(child);
      }
    }
  }

  return QUALITY_RUNNER_BEHAVIOR_DISPATCH_ORDER.filter((slice) => (
    requestedSlices.has(slice) && !shadowedChildren.has(slice)
  ));
}

export async function runQualityRunnerBehaviorSlices(requestedSlices) {
  for (const slice of slicesForRequestedBehaviorRun(requestedSlices)) {
    await runQualityRunnerBehaviorDispatcher(slice);
  }
}
