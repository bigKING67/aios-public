import { Input } from '@lobehub/ui';
import type { ReactNode } from 'react';
import { bindTextField, type ControlledForm } from '@/hooks/use-controlled-form';
import styles from './form-field.module.css';

export interface FormFieldProps<T extends object> {
  form: ControlledForm<T>;
  name: keyof T & string;
  label: ReactNode;
  required?: boolean;
  /** Help text under the control (antd Form.Item `extra`). */
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * One labelled form row: the label names the control through `htmlFor` (the field id from the
 * form), help text sits under it, and a validation error is announced with `role="alert"`.
 */
export function FormField<T extends object>({
  form,
  name,
  label,
  required = false,
  extra,
  className,
  children,
}: FormFieldProps<T>) {
  const id = form.fieldId(name);
  const messages = form.errorLists[name] ?? [];
  return (
    <div className={className ? `${styles.field} ${className}` : styles.field} data-invalid={messages.length ? 'true' : undefined}>
      {/* The required mark is drawn in CSS so the label text stays the field name. */}
      <label className={styles.label} htmlFor={id} data-required={required ? 'true' : undefined}>
        {label}
      </label>
      {children}
      {extra ? (
        <div className={styles.extra} id={`${id}-extra`}>
          {extra}
        </div>
      ) : null}
      {messages.length ? (
        <div className={styles.error} id={`${id}-error`} role="alert">
          {messages.length === 1 ? messages[0] : messages.map((message) => <div key={message}>{message}</div>)}
        </div>
      ) : null}
    </div>
  );
}

/** A text input row bound to one string field. */
export function TextFormField<T extends object>({
  form,
  name,
  label,
  placeholder,
  maxLength,
  extra,
  className,
  list,
  type,
}: Omit<FormFieldProps<T>, 'children' | 'required'> & {
  placeholder?: string;
  maxLength?: number;
  /** id of a `<datalist>` with suggestions. */
  list?: string;
  type?: 'text' | 'date';
}) {
  return (
    <FormField form={form} name={name} label={label} extra={extra} className={className}>
      <Input {...bindTextField(form, name)} placeholder={placeholder} maxLength={maxLength} list={list} type={type} />
    </FormField>
  );
}
