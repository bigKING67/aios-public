/**
 * Quality profile definitions for the quality-runner era.
 *
 * Profiles are no longer npm-run aggregators. They are stable named views over
 * the quality gate registry.
 */

import {
  buildQualityGateRegistry,
  gateNamesForMode,
  QUALITY_ENTRYPOINT_SCRIPTS,
  QUALITY_RUNNER_AGGREGATE_GATE_NAME,
  QUALITY_RUNNER_BEHAVIOR_COMMAND,
  QUALITY_RUNNER_SLICE_GATES,
  VIRTUAL_QUALITY_PACKAGE_SCRIPTS,
} from './quality-gate-registry.mjs';

export const QUALITY_PROFILE_NAMES = Object.freeze([
  'affected',
  'quick',
  'frontend',
  'backend',
  'runtime',
  'prepush',
  'ci',
  'release',
]);

export const QUALITY_PROFILE_PACKAGE_SCRIPTS = QUALITY_ENTRYPOINT_SCRIPTS;
export const QUALITY_RUNNER_PACKAGE_SCRIPTS = Object.freeze({
  [QUALITY_RUNNER_AGGREGATE_GATE_NAME]: QUALITY_RUNNER_BEHAVIOR_COMMAND,
});
export const QUALITY_RUNNER_VIRTUAL_PACKAGE_SCRIPTS = VIRTUAL_QUALITY_PACKAGE_SCRIPTS;
export const QUALITY_PROFILE_SCRIPT_NAMES = Object.freeze(
  Object.keys(QUALITY_PROFILE_PACKAGE_SCRIPTS),
);

function gate(name, label = `[quality] ${name}`) {
  return Object.freeze({ name, label });
}

function profileFromRegistry(profileName, registry) {
  return Object.freeze({
    name: profileName,
    description: `Quality runner profile: ${profileName}.`,
    gates: Object.freeze(gateNamesForMode(registry, profileName).map((name) => {
      const registryGate = registry.byName.get(name);
      return gate(name, registryGate?.label);
    })),
  });
}

export const QUALITY_PROFILES = Object.freeze(
  Object.fromEntries(
    QUALITY_PROFILE_NAMES.map((profileName) => [
      profileName,
      profileFromRegistry(profileName, buildQualityGateRegistry()),
    ]),
  ),
);

export function isQualityProfileScriptName(scriptName) {
  return QUALITY_PROFILE_SCRIPT_NAMES.includes(scriptName)
    || scriptName === QUALITY_RUNNER_AGGREGATE_GATE_NAME
    || QUALITY_RUNNER_SLICE_GATES.includes(scriptName);
}

export function profileNameFromScriptName(scriptName) {
  if (!isQualityProfileScriptName(scriptName)) {
    return null;
  }
  return scriptName.slice('verify:'.length);
}

export function getQualityProfile(profileName, options = {}) {
  if (!QUALITY_PROFILE_NAMES.includes(profileName)) {
    return null;
  }
  const registry = options.registry ?? buildQualityGateRegistry(options);
  return profileFromRegistry(profileName, registry);
}

export function listQualityProfiles(options = {}) {
  const registry = options.registry ?? buildQualityGateRegistry(options);
  return QUALITY_PROFILE_NAMES.map((profileName) => profileFromRegistry(profileName, registry));
}
