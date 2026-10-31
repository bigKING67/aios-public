import { type ChangeEvent, useId, useReducer, useRef, useState } from 'react';

/**
 * Controlled form state for lobe-ui forms (lobe-ui has no antd-compatible Form). It keeps
 * the subset of the antd FormInstance API those modals used — get/set values, field errors,
 * `isFieldTouched`, `validateFields`, `submit` — so their flows read the same, and validates the
 * same `{ required, message }` rules on submit and on each user edit.
 */
export type ControlledFormRule<T> = {
  required?: boolean;
  /** With `required`: a string of only spaces counts as empty. */
  whitespace?: boolean;
  /** Minimum length of a string value. */
  min?: number;
  /** Pattern a string value must match. */
  pattern?: RegExp;
  /** Custom check; return true when the value is valid. */
  validator?: (value: unknown, values: T) => boolean;
  message: string;
};

type FieldName<T> = keyof T & string;
export type ControlledFormRules<T> = Partial<Record<FieldName<T>, ControlledFormRule<T>[]>>;
export type ControlledFormErrors<T> = Partial<Record<FieldName<T>, string>>;
/** Every failing rule message per field, in rule order (antd shows them all). */
export type ControlledFormErrorLists<T> = Partial<Record<FieldName<T>, string[]>>;

export interface ControlledForm<T extends object> {
  /** Current values; re-renders on change (replaces `Form.useWatch`). */
  values: T;
  /** The first failing message per field. */
  errors: ControlledFormErrors<T>;
  /** Every failing message per field. */
  errorLists: ControlledFormErrorLists<T>;
  getFieldsValue: () => T;
  getFieldValue: <K extends FieldName<T>>(name: K) => T[K];
  setFieldValue: <K extends FieldName<T>>(name: K, value: T[K]) => void;
  setFieldsValue: (next: Partial<T>) => void;
  setFields: (fields: Array<{ name: FieldName<T>; errors?: string[] }>) => void;
  /** Back to the initial values, with no errors and nothing touched. */
  resetFields: () => void;
  isFieldTouched: (name: FieldName<T>) => boolean;
  /** Resolves with the values, or rejects after showing every rule error. */
  validateFields: () => Promise<T>;
  /** Validates, then calls `onFinish`. */
  submit: () => void;
  /** A user edit: updates the value, marks it touched, re-checks its rules and reports `onValuesChange`. */
  change: <K extends FieldName<T>>(name: K, value: T[K]) => void;
  fieldId: (name: FieldName<T>) => string;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** An empty value only fails `required`; the other rules run once the field has a value. */
function ruleErrors<T>(rules: readonly ControlledFormRule<T>[] | undefined, value: unknown, values: T): string[] {
  const blank = typeof value === 'string' && value.trim() === '';
  return (rules ?? [])
    .filter((rule) =>
      isEmptyValue(value) || (rule.whitespace && blank)
        ? rule.required
        : (rule.min !== undefined && String(value).length < rule.min)
          || (rule.pattern !== undefined && !rule.pattern.test(String(value)))
          || (rule.validator !== undefined && !rule.validator(value, values)),
    )
    .map((rule) => rule.message);
}

export class ControlledFormValidationError<T> extends Error {
  constructor(readonly errors: ControlledFormErrors<T>) {
    super('表单校验未通过');
  }
}

export function useControlledForm<T extends object>({
  initialValues,
  rules,
  onValuesChange,
  onFinish,
  ids,
}: {
  initialValues: T;
  /** Fixed element ids for fields that need them (e.g. `#username` on the sign-in page). */
  ids?: Partial<Record<FieldName<T>, string>>;
  rules?: ControlledFormRules<T>;
  onValuesChange?: (changed: Partial<T>, values: T) => void;
  onFinish?: (values: T) => void;
}): ControlledForm<T> {
  const idPrefix = useId();
  // Callers pass fresh objects/closures each render; the form reads the latest through this ref.
  const latest = useRef({ initialValues, rules, onValuesChange, onFinish, ids });
  latest.current = { initialValues, rules, onValuesChange, onFinish, ids };
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  // One stable object (safe in effect dependencies, like an antd FormInstance); values and
  // errors live in refs and every write re-renders the owner.
  const [form] = useState<ControlledForm<T>>(() => {
    let values = initialValues;
    let lists: ControlledFormErrorLists<T> = {};
    let firsts: ControlledFormErrors<T> = {};
    let touched = new Set<string>();
    const setValues = (next: T) => {
      values = next;
      rerender();
    };
    const setLists = (next: ControlledFormErrorLists<T>) => {
      lists = next;
      firsts = Object.fromEntries(
        Object.entries(next).flatMap(([name, messages]) => ((messages as string[] | undefined)?.length ? [[name, (messages as string[])[0]]] : [])),
      ) as ControlledFormErrors<T>;
    };
    const validateFields = () => {
      const next: ControlledFormErrorLists<T> = {};
      for (const [name, fieldRules] of Object.entries(latest.current.rules ?? {})) {
        const messages = ruleErrors(fieldRules as ControlledFormRule<T>[], values[name as FieldName<T>], values);
        if (messages.length) next[name as FieldName<T>] = messages;
      }
      setLists(next);
      rerender();
      return Object.keys(next).length > 0
        ? Promise.reject(new ControlledFormValidationError<T>(firsts))
        : Promise.resolve(values);
    };
    return {
      get values() {
        return values;
      },
      get errors() {
        return firsts;
      },
      get errorLists() {
        return lists;
      },
      getFieldsValue: () => values,
      getFieldValue: (name) => values[name],
      setFieldValue: (name, value) => setValues({ ...values, [name]: value }),
      setFieldsValue: (next) => setValues({ ...values, ...next }),
      setFields: (fields) => {
        const next = { ...lists };
        for (const field of fields) {
          if (field.errors?.length) next[field.name] = [...field.errors];
          else delete next[field.name];
        }
        setLists(next);
        rerender();
      },
      resetFields: () => {
        touched = new Set();
        setLists({});
        setValues(latest.current.initialValues);
      },
      isFieldTouched: (name) => touched.has(name),
      validateFields,
      submit: () => {
        validateFields().then(
          (current) => latest.current.onFinish?.(current),
          () => undefined
        );
      },
      change: (name, value) => {
        const next = { ...values, [name]: value };
        touched.add(name);
        // Touched fields re-check with every edit, so a rule that reads another field (a
        // confirmation password) follows it.
        const nextLists = { ...lists };
        for (const field of touched) {
          const fieldName = field as FieldName<T>;
          const messages = ruleErrors(latest.current.rules?.[fieldName], next[fieldName], next);
          if (messages.length) nextLists[fieldName] = messages;
          else delete nextLists[fieldName];
        }
        setLists(nextLists);
        setValues(next);
        latest.current.onValuesChange?.({ [name]: value } as unknown as Partial<T>, next);
      },
      fieldId: (name) => latest.current.ids?.[name] ?? `${idPrefix}-${name}`,
    };
  });
  return form;
}

/** Props for a lobe Input / TextArea bound to a string field. */
export function bindTextField<T extends object>(form: ControlledForm<T>, name: FieldName<T>) {
  const id = form.fieldId(name);
  const error = form.errors[name];
  return {
    id,
    value: (form.values[name] as string | undefined) ?? '',
    'aria-invalid': error ? true : undefined,
    // The field's help text (FormField `extra`) and errors describe it; a missing id is ignored.
    'aria-describedby': error ? `${id}-extra ${id}-error` : `${id}-extra`,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      form.change(name, event.target.value as T[FieldName<T>]),
  };
}

/** Props for a LabeledSelect (named by the field's outer label) bound to a field. */
export function bindSelectField<T extends object, K extends FieldName<T>>(form: ControlledForm<T>, name: K) {
  return {
    id: form.fieldId(name),
    value: form.values[name],
    onChange: (value: T[K]) => form.change(name, value),
  };
}

/** Props for a lobe InputNumber bound to a numeric field (lobe names its input through `id`). */
export function bindNumberField<T extends object>(form: ControlledForm<T>, name: FieldName<T>) {
  return {
    id: form.fieldId(name),
    value: (form.values[name] as number | undefined) ?? null,
    onChange: (value: number | null) => form.change(name, (value ?? undefined) as T[FieldName<T>]),
  };
}
