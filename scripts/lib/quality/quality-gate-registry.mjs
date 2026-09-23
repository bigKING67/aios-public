/**
 * AIOS quality gate registry.
 *
 * This module turns the historical verify gate lists into a richer execution
 * graph: command, group, cache policy, dependency hints, and affected metadata.
 */

import {
  isQualityRunnerCompatSliceGate,
  QUALITY_RUNNER_AGGREGATE_GATE_NAME,
  QUALITY_RUNNER_BEHAVIOR_COMMAND,
  QUALITY_RUNNER_SLICE_GATES,
  QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS,
} from './quality-runner-slices.mjs';
import {
  BACKEND_GATE_NAMES,
  VIRTUAL_QUALITY_PACKAGE_SCRIPTS,
} from './quality-gate-registry-metadata.mjs';
import {
  collectQualityGateRegistryBaseGates,
} from './quality-gate-registry-base-gates.mjs';
import {
  readPackageJson,
} from './quality-gate-registry-scripts.mjs';
import {
  buildQualityGateRegistryGates,
} from './quality-gate-registry-gates.mjs';

export {
  expandNamedInputPatterns,
} from './quality-gate-input-expansion.mjs';

export {
  QUALITY_NAMED_INPUTS,
} from './quality-gate-named-inputs.mjs';

export {
  BACKEND_GATE_NAMES,
  FRONTEND_DASHBOARD_GATE_NAMES,
  QUALITY_ENTRYPOINT_SCRIPTS,
  QUALITY_RUNNER_COMMANDS,
  QUALITY_RUNNER_REGISTRY_BASE_GATES,
  VIRTUAL_QUALITY_PACKAGE_SCRIPTS,
} from './quality-gate-registry-metadata.mjs';

export {
  isQualityRunnerCompatSliceGate,
  QUALITY_RUNNER_AGGREGATE_GATE_NAME,
  QUALITY_RUNNER_BEHAVIOR_COMMAND,
  QUALITY_RUNNER_SLICE_GATES,
  QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS,
};

export {
  validateQualityGateRegistry,
} from './quality-gate-registry-validation.mjs';

export function readPackageJsonForRegistry(repoRoot) {
  return readPackageJson(repoRoot);
}

export function buildQualityGateRegistry(options = {}) {
  const {
    packageJson,
    repoRoot = process.cwd(),
  } = options;
  const pkg = packageJson ?? readPackageJson(repoRoot);
  const scripts = {
    ...pkg.scripts,
    ...VIRTUAL_QUALITY_PACKAGE_SCRIPTS,
  };
  const { baseGatesByName, ciGateNames } = collectQualityGateRegistryBaseGates();

  const gates = buildQualityGateRegistryGates({ baseGatesByName, scripts, ciGateNames });
  const byName = new Map(gates.map((gate) => [gate.name, gate]));

  return Object.freeze({
    gates: Object.freeze(gates),
    byName,
    ciGateNames: Object.freeze([...ciGateNames]),
  });
}

export function gateNamesForMode(registry, mode) {
  if (mode === 'affected') {
    return registry.gates
      .filter((gate) => gate.modes.includes('quick'))
      .map((gate) => gate.name);
  }
  if (mode === 'prepush') {
    return registry.gates
      .filter((gate) => gate.modes.includes('quick'))
      .map((gate) => gate.name);
  }
  if (mode === 'ci') {
    return registry.ciGateNames;
  }
  if (mode === 'backend') {
    return BACKEND_GATE_NAMES;
  }
  if (mode === 'runtime') {
    return [
      'test:frontend:smoke:public',
      'test:frontend:smoke:preview',
      'test:frontend:smoke:preview:performance',
      'verify:reports:special-browser-smoke',
    ];
  }
  if (mode === 'release') {
    return ['verify:ci', 'test:frontend:smoke:preview'];
  }
  return registry.gates
    .filter((gate) => gate.modes.includes(mode))
    .map((gate) => gate.name);
}

export function selectGatesByNames(registry, names, options = {}) {
  const { includeDeps = true } = options;
  const missing = [];
  const gates = [];
  const seen = new Set();

  function addGate(name) {
    if (seen.has(name)) {
      return;
    }
    seen.add(name);
    const gate = registry.byName.get(name);
    if (!gate) {
      missing.push(name);
      return;
    }
    if (includeDeps) {
      for (const depName of gate.deps ?? []) {
        addGate(depName);
      }
    }
    gates.push(gate);
  }

  for (const name of names) {
    addGate(name);
  }

  return { gates, missing };
}
