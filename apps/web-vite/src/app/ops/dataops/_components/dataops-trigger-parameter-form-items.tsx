'use client';

import { Form, Input, InputNumber, Select, Switch } from 'antd';
import type { Rule } from 'antd/es/form';
import type { DataOpsTriggerParameterSpec } from '@/config/dataops-trigger-params';

interface DataOpsTriggerParameterFormItemsProps {
  specs: DataOpsTriggerParameterSpec[];
  itemKeyPrefix?: string;
}

function buildTriggerParameterRules(spec: DataOpsTriggerParameterSpec): Rule[] | undefined {
  const rules: Rule[] = [];
  if (spec.required) {
    rules.push({ required: true, message: `请输入${spec.label}` });
  }
  if (spec.key === 'month_period') {
    rules.push({
      validator: (_rule: unknown, value: unknown) => {
        const normalized = typeof value === 'string' ? value.trim() : '';
        if (!normalized) {
          return Promise.resolve();
        }

        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(normalized)) {
          return Promise.resolve();
        }

        return Promise.reject(new Error('格式示例：2026-02'));
      },
    });
  }

  return rules.length ? rules : undefined;
}

function buildBooleanParameterRules(
  spec: DataOpsTriggerParameterSpec,
  deliveryMode: unknown
): Rule[] | undefined {
  const rules: Rule[] = [];
  if (spec.required) {
    rules.push({
      validator: (_rule: unknown, value: unknown) => (
        value === undefined
          ? Promise.reject(new Error(`请选择${spec.label}`))
          : Promise.resolve()
      ),
    });
  }

  if (spec.key === 'production_confirmed' && deliveryMode === 'production') {
    rules.push({
      validator: (_rule: unknown, value: unknown) => (
        value === true
          ? Promise.resolve()
          : Promise.reject(new Error('正式投递前必须开启确认开关'))
      ),
    });
  }

  return rules.length ? rules : undefined;
}

function buildStringParameterRules(spec: DataOpsTriggerParameterSpec): Rule[] | undefined {
  const rules = buildTriggerParameterRules(spec) || [];
  if (spec.options?.length) {
    const allowedValues = new Set(spec.options.map((option) => option.value));
    rules.push({
      validator: (_rule: unknown, value: unknown) => (
        value === undefined || value === null || value === '' || allowedValues.has(String(value))
          ? Promise.resolve()
          : Promise.reject(new Error(`请选择有效的${spec.label}`))
      ),
    });
  }
  return rules.length ? rules : undefined;
}

export function DataOpsTriggerParameterFormItems({
  specs,
  itemKeyPrefix = '',
}: DataOpsTriggerParameterFormItemsProps) {
  const deliveryMode = Form.useWatch('delivery_mode');

  return (
    <>
      {specs.map((spec) => {
        const itemKey = `${itemKeyPrefix}${spec.key}`;
        if (spec.type === 'number') {
          return (
            <Form.Item
              key={itemKey}
              name={spec.key}
              label={spec.label}
              rules={buildTriggerParameterRules(spec)}
            >
              <InputNumber
                min={spec.min}
                max={spec.max}
                precision={spec.integer === false ? undefined : 0}
                step={spec.integer === false ? 0.1 : 1}
                placeholder={spec.placeholder}
                style={{ width: '100%' }}
              />
            </Form.Item>
          );
        }

        if (spec.type === 'boolean') {
          return (
            <Form.Item
              key={itemKey}
              name={spec.key}
              label={spec.label}
              valuePropName="checked"
              rules={buildBooleanParameterRules(spec, deliveryMode)}
            >
              <Switch />
            </Form.Item>
          );
        }

        if (spec.options?.length) {
          return (
            <Form.Item
              key={itemKey}
              name={spec.key}
              label={spec.label}
              rules={buildStringParameterRules(spec)}
            >
              <Select
                options={spec.options}
                placeholder={spec.placeholder || `请选择${spec.label}`}
              />
            </Form.Item>
          );
        }

        return (
          <Form.Item
            key={itemKey}
            name={spec.key}
            label={spec.label}
            rules={buildStringParameterRules(spec)}
          >
            <Input placeholder={spec.placeholder} />
          </Form.Item>
        );
      })}
    </>
  );
}
