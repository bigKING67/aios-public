import {
  QUALITY_RUNNER_AGGREGATE_GATE_NAME,
  QUALITY_RUNNER_SLICE_DEFINITIONS,
  QUALITY_RUNNER_SLICE_GATES,
} from './quality-runner-slices.mjs';
import {
  BACKEND_GATE_NAMES,
  DEFAULT_CI_GATE_NAMES,
  FRONTEND_DASHBOARD_GATE_NAMES,
  QUALITY_RUNNER_REGISTRY_BASE_GATES,
} from './quality-gate-registry-metadata.mjs';
import {
  SPECIAL_REPORT_BROWSER_SMOKE_GATE,
  SPECIAL_REPORT_SMOKE_GATE,
} from '../reports/special-report-smoke-gate.mjs';

export function collectQualityGateRegistryBaseGates() {
  const ciGateNames = new Set(DEFAULT_CI_GATE_NAMES);
  const baseGatesByName = new Map();

  for (const gate of QUALITY_RUNNER_REGISTRY_BASE_GATES) {
    baseGatesByName.set(gate.name, gate);
  }

  for (const name of BACKEND_GATE_NAMES) {
    baseGatesByName.set(name, {
      name,
      label: `[quality] ${name}`,
    });
  }

  for (const name of FRONTEND_DASHBOARD_GATE_NAMES) {
    baseGatesByName.set(name, {
      name,
      label: `[quality] ${name}`,
    });
  }

  for (const name of [
    'test:frontend:smoke:public',
    'test:frontend:smoke:preview',
    'test:frontend:smoke:preview:performance',
    'test:frontend:smoke:preview:authenticated:performance',
  ]) {
    baseGatesByName.set(name, {
      name,
      label: `[quality] ${name}`,
    });
  }

  baseGatesByName.set(SPECIAL_REPORT_SMOKE_GATE.name, SPECIAL_REPORT_SMOKE_GATE);
  ciGateNames.add(SPECIAL_REPORT_SMOKE_GATE.name);
  baseGatesByName.set(SPECIAL_REPORT_BROWSER_SMOKE_GATE.name, SPECIAL_REPORT_BROWSER_SMOKE_GATE);

  baseGatesByName.set(QUALITY_RUNNER_AGGREGATE_GATE_NAME, {
    name: QUALITY_RUNNER_AGGREGATE_GATE_NAME,
    label: '[quality] quality runner behavior',
  });
  for (const definition of QUALITY_RUNNER_SLICE_DEFINITIONS) {
    baseGatesByName.set(definition.name, {
      name: definition.name,
      label: definition.label,
    });
  }
  baseGatesByName.set('verify:ci', {
    name: 'verify:ci',
    label: '[quality] full static ci gate',
  });

  for (const name of QUALITY_RUNNER_SLICE_GATES) {
    ciGateNames.add(name);
  }

  return {
    baseGatesByName,
    ciGateNames,
  };
}
