import {
  SPECIAL_REPORT_BROWSER_SMOKE_GATE_NAME,
  SPECIAL_REPORT_SMOKE_GATE_INPUTS,
  SPECIAL_REPORT_SMOKE_GATE_NAME,
  SPECIAL_REPORT_SMOKE_MAINTENANCE_FILES,
} from '../../config/reports/special-smoke-inputs.mjs';

export {
  SPECIAL_REPORT_BROWSER_SMOKE_COMMAND,
  SPECIAL_REPORT_BROWSER_SMOKE_GATE_NAME,
  SPECIAL_REPORT_CHART_GALLERY_DOC,
  SPECIAL_REPORT_PAGE_COMPOSITION_DOC,
  SPECIAL_REPORT_SMOKE_COMMAND,
  SPECIAL_REPORT_SMOKE_GATE_INPUTS,
  SPECIAL_REPORT_SMOKE_GATE_NAME,
  SPECIAL_REPORT_SMOKE_MAINTENANCE_FILES,
  SPECIAL_REPORT_SMOKE_ROUTE,
} from '../../config/reports/special-smoke-inputs.mjs';

export const SPECIAL_REPORT_SMOKE_GATE = Object.freeze({
  name: SPECIAL_REPORT_SMOKE_GATE_NAME,
  label: '[quality] special report smoke',
});

export const SPECIAL_REPORT_BROWSER_SMOKE_GATE = Object.freeze({
  name: SPECIAL_REPORT_BROWSER_SMOKE_GATE_NAME,
  label: '[quality] special report authenticated browser smoke',
});

export function specialReportSmokeGateInputPatterns(name, context = {}) {
  if (
    name !== SPECIAL_REPORT_SMOKE_GATE_NAME
    && name !== SPECIAL_REPORT_BROWSER_SMOKE_GATE_NAME
  ) {
    return null;
  }

  const {
    checkGuardHelperInputs = [],
    shared = [],
  } = context;

  return [
    ...SPECIAL_REPORT_SMOKE_GATE_INPUTS,
    ...checkGuardHelperInputs,
    ...shared,
  ];
}

export function isSpecialReportSmokeSourceFile(file) {
  return file.startsWith('apps/web-vite/src/app/reports/special/');
}

export function isSpecialReportSmokeMaintenanceFile(file) {
  return SPECIAL_REPORT_SMOKE_MAINTENANCE_FILES.includes(file);
}
