export const ALLOWLIST_CONFIG_GATE_GROUPS = Object.freeze({
  'scripts/config/allowlists/antd-table-selector-allowlist.json': Object.freeze([
    'verify:design:antd-table-selectors-behavior',
    'verify:design:antd-table-selectors',
    'verify:design:behavior-gate-registry',
  ]),
  'scripts/config/allowlists/app-inline-visual-style-allowlist.json': Object.freeze([
    'verify:app:inline-styles-behavior',
    'verify:app:inline-styles',
    'verify:frontend:structure-gate-registry',
  ]),
  'scripts/config/allowlists/app-module-boundary-allowlist.json': Object.freeze([
    'verify:app:boundaries-behavior',
    'verify:app:boundaries',
    'verify:frontend:structure-gate-registry',
  ]),
  'scripts/config/allowlists/app-page-size-allowlist.json': Object.freeze([
    'verify:app:page-size-behavior',
    'verify:app:page-size',
    'verify:frontend:structure-gate-registry',
  ]),
  'scripts/config/allowlists/backend-rust-module-size-allowlist.json': Object.freeze([
    'verify:backend:size',
  ]),
  'scripts/config/allowlists/css-module-size-allowlist.json': Object.freeze([
    'verify:css-modules:size-behavior',
    'verify:css-modules:size',
    'verify:frontend:structure-gate-registry',
  ]),
  'scripts/config/allowlists/css-module-typography-allowlist.json': Object.freeze([
    'verify:design:typography',
    'verify:design:behavior-gate-registry',
  ]),
  'scripts/config/allowlists/design-raw-color-allowlist.json': Object.freeze([
    'verify:design:raw-colors-behavior',
    'verify:design:raw-color-source-allowlist-behavior',
    'verify:design:raw-colors',
    'verify:design:behavior-gate-registry',
  ]),
  'scripts/config/allowlists/frontend-component-size-allowlist.json': Object.freeze([
    'verify:components:size-behavior',
    'verify:components:size',
    'verify:frontend:structure-gate-registry',
  ]),
  'scripts/config/allowlists/shared-inline-visual-style-allowlist.json': Object.freeze([
    'verify:components:inline-styles-behavior',
    'verify:components:inline-styles',
    'verify:frontend:structure-gate-registry',
  ]),
  'scripts/config/allowlists/tailwind-utility-color-allowlist.json': Object.freeze([
    'verify:design:tailwind-utilities-behavior',
    'verify:design:tailwind-utilities',
    'verify:design:behavior-gate-registry',
  ]),
});

export function allowlistConfigAffectedRule(file) {
  if (!Object.hasOwn(ALLOWLIST_CONFIG_GATE_GROUPS, file)) {
    return null;
  }

  return {
    gates: ALLOWLIST_CONFIG_GATE_GROUPS[file],
    reason: `${file}: gate allowlist config`,
  };
}

const ALLOWLIST_REGISTRY_GATES = new Set([
  'verify:design:behavior-gate-registry',
  'verify:frontend:structure-gate-registry',
]);

export const ALLOWLIST_CONFIG_INPUT_GATE_GROUPS = Object.freeze(
  Object.fromEntries(
    Object.entries(ALLOWLIST_CONFIG_GATE_GROUPS).map(([file, gates]) => [
      file,
      Object.freeze(gates.filter((gate) => !ALLOWLIST_REGISTRY_GATES.has(gate))),
    ]),
  ),
);
