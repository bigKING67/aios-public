'use client';

import { Input, InputNumber, Switch } from '@lobehub/ui';
import type { DataOpsTriggerParameterSpec } from '@/config/dataops-trigger-params';
import { FormField } from '@/components/molecules/form-field';
import { LabeledSelect } from '@/components/molecules/labeled-select';
import { bindTextField } from '@/hooks/use-controlled-form';
import type { DataOpsTriggerForm } from './dataops-trigger-parameter-form';

interface DataOpsTriggerParameterFormItemsProps {
  form: DataOpsTriggerForm;
  specs: DataOpsTriggerParameterSpec[];
  itemKeyPrefix?: string;
}

export function DataOpsTriggerParameterFormItems({
  form,
  specs,
  itemKeyPrefix = '',
}: DataOpsTriggerParameterFormItemsProps) {
  return (
    <>
      {specs.map((spec) => {
        const itemKey = `${itemKeyPrefix}${spec.key}`;
        const fieldId = form.fieldId(spec.key);
        const error = form.errors[spec.key];
        const invalidProps = {
          'aria-invalid': error ? true : undefined,
          'aria-describedby': error ? `${fieldId}-error` : undefined,
        } as const;
        const required = Boolean(spec.required);

        if (spec.type === 'number') {
          const value = form.values[spec.key];
          return (
            <FormField key={itemKey} form={form} name={spec.key} label={spec.label} required={required}>
              <InputNumber
                id={fieldId}
                {...invalidProps}
                value={typeof value === 'number' ? value : null}
                onChange={(next) => form.change(spec.key, next as number)}
                min={spec.min}
                max={spec.max}
                precision={spec.integer === false ? undefined : 0}
                step={spec.integer === false ? 0.1 : 1}
                placeholder={spec.placeholder}
              />
            </FormField>
          );
        }

        if (spec.type === 'boolean') {
          return (
            <FormField key={itemKey} form={form} name={spec.key} label={spec.label} required={required}>
              <Switch
                id={fieldId}
                {...invalidProps}
                checked={form.values[spec.key] === true}
                onChange={(checked) => form.change(spec.key, checked)}
              />
            </FormField>
          );
        }

        if (spec.options?.length) {
          const value = form.values[spec.key];
          return (
            <FormField key={itemKey} form={form} name={spec.key} label={spec.label} required={required}>
              <LabeledSelect<string>
                id={fieldId}
                value={value === undefined ? undefined : String(value)}
                onChange={(next) => form.change(spec.key, next as string)}
                options={spec.options}
                placeholder={spec.placeholder || `请选择${spec.label}`}
              />
            </FormField>
          );
        }

        return (
          <FormField key={itemKey} form={form} name={spec.key} label={spec.label} required={required}>
            <Input {...bindTextField(form, spec.key)} placeholder={spec.placeholder} />
          </FormField>
        );
      })}
    </>
  );
}
