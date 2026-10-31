import { useMemo } from 'react';
import type { DataOpsTriggerParameterSpec } from '@/config/dataops-trigger-params';
import {
  type ControlledForm,
  type ControlledFormRule,
  type ControlledFormRules,
  useControlledForm,
} from '@/hooks/use-controlled-form';

export type TriggerFormValues = Record<string, string | number | boolean>;
export type DataOpsTriggerForm = ControlledForm<TriggerFormValues>;

const EMPTY_TRIGGER_FORM_VALUES: TriggerFormValues = {};
const MONTH_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function buildSpecRules(spec: DataOpsTriggerParameterSpec): ControlledFormRule<TriggerFormValues>[] {
  if (spec.type === 'boolean') {
    const rules: ControlledFormRule<TriggerFormValues>[] = [];
    if (spec.required) {
      rules.push({ required: true, message: `请选择${spec.label}` });
    }
    if (spec.key === 'production_confirmed') {
      // Only the production delivery mode needs the separate confirmation.
      rules.push({
        validator: (value, values) => values.delivery_mode !== 'production' || value === true,
        message: '正式投递前必须开启确认开关',
      });
    }
    return rules;
  }

  const rules: ControlledFormRule<TriggerFormValues>[] = [];
  if (spec.required) {
    rules.push({ required: true, message: `请输入${spec.label}` });
  }
  if (spec.key === 'month_period') {
    rules.push({
      validator: (value) => {
        const normalized = typeof value === 'string' ? value.trim() : '';
        return !normalized || MONTH_PERIOD_PATTERN.test(normalized);
      },
      message: '格式示例：2026-02',
    });
  }
  if (spec.type !== 'number' && spec.options?.length) {
    const allowedValues = new Set(spec.options.map((option) => option.value));
    rules.push({
      validator: (value) => allowedValues.has(String(value)),
      message: `请选择有效的${spec.label}`,
    });
  }
  return rules;
}

/** The validation rules of the parameter fields, with the messages the antd form used. */
export function buildTriggerParameterFormRules(
  specs: DataOpsTriggerParameterSpec[]
): ControlledFormRules<TriggerFormValues> {
  const rules: ControlledFormRules<TriggerFormValues> = {};
  for (const spec of specs) {
    const specRules = buildSpecRules(spec);
    if (specRules.length) {
      rules[spec.key] = specRules;
    }
  }
  return rules;
}

/** Controlled form of the trigger parameters; the rules follow the specs shown. */
export function useDataOpsTriggerForm(specs: DataOpsTriggerParameterSpec[]): DataOpsTriggerForm {
  const rules = useMemo(() => buildTriggerParameterFormRules(specs), [specs]);
  return useControlledForm<TriggerFormValues>({ initialValues: EMPTY_TRIGGER_FORM_VALUES, rules });
}
