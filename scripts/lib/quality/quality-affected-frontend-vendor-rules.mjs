const FRONTEND_VENDOR_PREFLIGHT_GATES = Object.freeze([
  'verify:frontend:preflight',
  'verify:frontend:delivery-gate-registry',
  'verify:ci:wiring',
]);

export function frontendVendorAffectedRule(file) {
  if (!file.startsWith('tools/vendor/frontend-preflight/')) {
    return null;
  }

  return {
    gates: FRONTEND_VENDOR_PREFLIGHT_GATES,
    reason: `${file}: frontend preflight vendor impact`,
  };
}
