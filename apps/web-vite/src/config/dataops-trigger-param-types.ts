export type DataOpsTriggerParameterType = 'number' | 'string' | 'boolean';

export interface DataOpsTriggerParameterOption {
  label: string;
  value: string;
}

export interface DataOpsTriggerParameterSpec {
  key: string;
  label: string;
  type: DataOpsTriggerParameterType;
  description?: string;
  required?: boolean;
  /**
   * number 类型参数默认要求整数；仅在明确需要小数时设置为 false
   */
  integer?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  options?: DataOpsTriggerParameterOption[];
  defaultValue?: string | number | boolean;
}

export type DataOpsTriggerParameterSpecsMap = Record<string, DataOpsTriggerParameterSpec[]>;
