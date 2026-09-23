import {
  isQualityRunnerSliceGate,
  QUALITY_RUNNER_AGGREGATE_GATE_NAME,
} from './quality-runner-slices.mjs';
import {
  BACKEND_GATE_NAMES,
  EXPLICIT_DEPS,
} from './quality-gate-registry-metadata.mjs';
import {
  resolveBaseGateCommand,
} from './quality-gate-registry-scripts.mjs';
import {
  inferGateInputs,
} from './quality-gate-inputs.mjs';
import {
  groupForGateName,
  inferCacheable,
  inferCost,
  inferEnvKeys,
  inferModes,
  inferOutputs,
  inferParallel,
} from './quality-gate-registry-inference.mjs';

function makeGate(baseGate, scripts, ciGateNames) {
  const command = resolveBaseGateCommand(baseGate, scripts);
  const group = groupForGateName(baseGate.name, {
    isQualityRunnerSliceGate,
    qualityRunnerAggregateGateName: QUALITY_RUNNER_AGGREGATE_GATE_NAME,
  });
  const deps = new Set(EXPLICIT_DEPS[baseGate.name] ?? []);
  if (baseGate.name.endsWith('-behavior')) {
    // Behavior gates protect their paired production gate; the paired gate
    // adds the reverse dependency below when present in the registry.
  }

  return Object.freeze({
    ...baseGate,
    command,
    group,
    envKeys: inferEnvKeys(baseGate.name, command),
    inputs: inferGateInputs(baseGate.name, group, command),
    outputs: inferOutputs(baseGate.name),
    deps: [...deps],
    cacheable: inferCacheable(baseGate.name, command),
    parallel: inferParallel(baseGate.name, command),
    cost: inferCost(baseGate.name, command),
    modes: inferModes(baseGate.name, ciGateNames, {
      backendGateNames: BACKEND_GATE_NAMES,
      isQualityRunnerSliceGate,
    }),
  });
}

function applyPairedBehaviorDeps(gates) {
  const byName = new Map(gates.map((gate) => [gate.name, gate]));
  return gates.map((gate) => {
    const behaviorName = `${gate.name}-behavior`;
    if (gate.name.endsWith('-behavior') || !byName.has(behaviorName)) {
      return gate;
    }
    if (gate.deps.includes(behaviorName)) {
      return gate;
    }
    return Object.freeze({
      ...gate,
      deps: Object.freeze([...gate.deps, behaviorName]),
    });
  });
}

export function buildQualityGateRegistryGates({
  baseGatesByName,
  scripts,
  ciGateNames,
}) {
  return applyPairedBehaviorDeps(
    [...baseGatesByName.values()].map((gate) => makeGate(gate, scripts, ciGateNames)),
  );
}
