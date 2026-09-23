/**
 * Single source of truth for weekly tabs boundary gate metadata.
 *
 * The registry implementation and its behavior fixtures import this list so
 * package scripts, verify:ci labels, file targets, and canonical order cannot
 * drift independently.
 */

export const WEEKLY_BOUNDARY_GATES = Object.freeze([
  {
    name: 'verify:weekly:style-boundaries',
    command: 'node scripts/checks/weekly-tabs/style-boundaries.mjs',
    file: 'scripts/checks/weekly-tabs/style-boundaries.mjs',
    label: '[verify:ci] weekly tabs style boundaries',
  },
  {
    name: 'verify:weekly:render-boundaries',
    command: 'node scripts/checks/weekly-tabs/render-boundaries.mjs',
    file: 'scripts/checks/weekly-tabs/render-boundaries.mjs',
    label: '[verify:ci] weekly tabs render boundaries',
  },
  {
    name: 'verify:weekly:contract-boundaries',
    command: 'node scripts/checks/weekly-tabs/contract-boundaries.mjs',
    file: 'scripts/checks/weekly-tabs/contract-boundaries.mjs',
    label: '[verify:ci] weekly tabs contract boundaries',
  },
  {
    name: 'verify:weekly:contract-import-hygiene',
    command: 'node scripts/checks/weekly-tabs/contract-import-hygiene.mjs',
    file: 'scripts/checks/weekly-tabs/contract-import-hygiene.mjs',
    label: '[verify:ci] weekly tabs contract import hygiene',
  },
  {
    name: 'verify:weekly:contract-layers',
    command: 'node scripts/checks/weekly-tabs/contract-layers.mjs',
    file: 'scripts/checks/weekly-tabs/contract-layers.mjs',
    label: '[verify:ci] weekly tabs contract layers',
  },
  {
    name: 'verify:weekly:adapter-layers',
    command: 'node scripts/checks/weekly-tabs/adapter-layers.mjs',
    file: 'scripts/checks/weekly-tabs/adapter-layers.mjs',
    label: '[verify:ci] weekly tabs adapter layers',
  },
  {
    name: 'verify:weekly:module-names-behavior',
    command: 'node scripts/checks/weekly-tabs/module-names.behavior.mjs',
    file: 'scripts/checks/weekly-tabs/module-names.behavior.mjs',
    label: '[verify:ci] weekly tabs module names behavior',
  },
  {
    name: 'verify:weekly:module-names',
    command: 'node scripts/checks/weekly-tabs/module-names.mjs',
    file: 'scripts/checks/weekly-tabs/module-names.mjs',
    label: '[verify:ci] weekly tabs module names',
  },
  {
    name: 'verify:weekly:exported-props-boundaries',
    command: 'node scripts/checks/weekly-tabs/exported-props-boundaries.mjs',
    file: 'scripts/checks/weekly-tabs/exported-props-boundaries.mjs',
    label: '[verify:ci] weekly tabs exported props boundaries',
  },
]);

export const WEEKLY_BOUNDARY_REGISTRY_BEHAVIOR_META_GATE = Object.freeze({
  name: 'verify:weekly:boundary-gate-registry-behavior',
  command: 'node scripts/checks/weekly-tabs/boundary-gate-registry.behavior.mjs',
  file: 'scripts/checks/weekly-tabs/boundary-gate-registry.behavior.mjs',
  label: '[verify:ci] weekly tabs boundary gate registry behavior',
});

export const WEEKLY_BOUNDARY_REGISTRY_META_GATE = Object.freeze({
  name: 'verify:weekly:boundary-gate-registry',
  command: 'node scripts/checks/weekly-tabs/boundary-gate-registry.mjs',
  file: 'scripts/checks/weekly-tabs/boundary-gate-registry.mjs',
  label: '[verify:ci] weekly tabs boundary gate registry',
});

export const WEEKLY_BOUNDARY_EXPECTED_GATES = Object.freeze([
  ...WEEKLY_BOUNDARY_GATES,
  WEEKLY_BOUNDARY_REGISTRY_BEHAVIOR_META_GATE,
  WEEKLY_BOUNDARY_REGISTRY_META_GATE,
]);
