import type {
  DataOpsTriggerParameterSpec,
} from './dataops-trigger-param-types';

export function createFallbackWindowDaysParameter({
  max,
  defaultValue,
  description,
}: {
  max: number;
  defaultValue: number;
  description?: string;
}): DataOpsTriggerParameterSpec {
  const spec: DataOpsTriggerParameterSpec = {
    key: 'fallback_window_days',
    label: '增量回看天数',
    type: 'number',
    min: 1,
    max,
    defaultValue,
  };

  if (description) {
    spec.description = description;
  }

  return spec;
}

export function createInitWatermarkOnlyParameter(
  description?: string,
): DataOpsTriggerParameterSpec {
  const spec: DataOpsTriggerParameterSpec = {
    key: 'init_watermark_only',
    label: '仅初始化水位',
    type: 'boolean',
    defaultValue: false,
  };

  if (description) {
    spec.description = description;
  }

  return spec;
}
