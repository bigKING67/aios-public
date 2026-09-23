import {
  DATAOPS_DASHBOARD_TRIGGER_PARAMETER_SPECS,
} from './dataops-trigger-param-dashboard-specs';
import {
  DATAOPS_OPERATION_TRIGGER_PARAMETER_SPECS,
} from './dataops-trigger-param-operation-specs';
import {
  DATAOPS_WEEKLY_REPORT_TRIGGER_PARAMETER_SPECS,
} from './dataops-trigger-param-weekly-report-specs';
import type {
  DataOpsTriggerParameterSpec,
  DataOpsTriggerParameterSpecsMap,
} from './dataops-trigger-param-types';

export type {
  DataOpsTriggerParameterSpec,
  DataOpsTriggerParameterOption,
  DataOpsTriggerParameterSpecsMap,
  DataOpsTriggerParameterType,
} from './dataops-trigger-param-types';

export const DATAOPS_TRIGGER_PARAMETER_SPECS: DataOpsTriggerParameterSpecsMap = {
  ...DATAOPS_DASHBOARD_TRIGGER_PARAMETER_SPECS,
  ...DATAOPS_WEEKLY_REPORT_TRIGGER_PARAMETER_SPECS,
  ...DATAOPS_OPERATION_TRIGGER_PARAMETER_SPECS,
};

export function getDataOpsTriggerParameterSpecs(pipelineId: string): DataOpsTriggerParameterSpec[] {
  return DATAOPS_TRIGGER_PARAMETER_SPECS[pipelineId] || [];
}
