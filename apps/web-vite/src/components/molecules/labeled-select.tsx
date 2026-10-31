import { Select, type SelectOption, type SelectProps } from '@lobehub/ui';
import { type ReactNode, useId, useMemo } from 'react';
import { matchSelectOption } from './labeled-select-search';

export type LabeledSelectProps<Value extends string | number = string> = Omit<SelectProps<Value>, 'onChange' | 'mode'> & {
  /** Accessible name; rendered as a visually hidden label unless `visibleLabel`. Omit only when an outer `<label htmlFor={id}>` names it. */
  label?: ReactNode;
  visibleLabel?: boolean;
  /** Wrapper class: lobe Select does not forward a root className. */
  wrapperClassName?: string;
} & (
    | { mode?: undefined; onChange?: (value: Value | undefined) => void }
    | { mode: 'multiple' | 'tags'; onChange?: (value: Value[]) => void }
  );

/**
 * lobe Select with a real label. lobe Select does not forward `aria-label` or a root className
 * (DESIGN.md › Components), so the wrapper carries the class and a `<label htmlFor>` names the
 * trigger. `onChange` is narrowed to one value (single) or a list (multiple / tags), and search
 * matches `searchText` when an option carries one.
 */
// Base UI treats an empty-string value as "nothing selected", which would blank 「全部…」 options
// that use ''. Inside the select '' is carried by this token and mapped back on change.
const EMPTY_VALUE = '__aios_empty__';

function toInner<Value>(value: Value): Value {
  return (value === '' ? EMPTY_VALUE : value) as Value;
}

function toOuter<Value>(value: Value): Value {
  return (value === EMPTY_VALUE ? '' : value) as Value;
}

export function LabeledSelect<Value extends string | number = string>(props: LabeledSelectProps<Value>) {
  const { label, visibleLabel = false, wrapperClassName, id, mode, onChange, filterOption, value, options, ...rest } = props;
  // lobe Select treats `undefined` as uncontrolled; a caller passing `value` (even undefined) controls it.
  const controlledValue =
    'value' in props ? (Array.isArray(value) ? value.map(toInner) : value == null ? null : toInner(value)) : undefined;
  const innerOptions = useMemo(
    () =>
      options?.map((option) =>
        'options' in option && Array.isArray(option.options)
          ? { ...option, options: option.options.map((child) => ({ ...child, value: toInner(child.value) })) }
          : { ...option, value: toInner((option as SelectOption<Value>).value) },
      ),
    [options],
  );
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const handleChange = (next: Value | Value[] | null | undefined) => {
    if (!onChange) return;
    const outer = Array.isArray(next) ? next.map(toOuter) : next == null ? next : toOuter(next);
    if (mode) {
      (onChange as (values: Value[]) => void)(Array.isArray(outer) ? outer : outer == null ? [] : [outer]);
      return;
    }
    (onChange as (single: Value | undefined) => void)(Array.isArray(outer) ? outer[0] : (outer ?? undefined));
  };
  return (
    <div className={wrapperClassName}>
      {label == null ? null : (
        <label className={visibleLabel ? undefined : 'sr-only'} htmlFor={selectId}>
          {label}
        </label>
      )}
      <Select
        {...rest}
        id={selectId}
        mode={mode}
        options={innerOptions as SelectProps<Value>['options']}
        value={controlledValue}
        filterOption={filterOption ?? matchSelectOption}
        onChange={handleChange}
      />
    </div>
  );
}
