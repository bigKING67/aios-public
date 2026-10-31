import { InputNumber, type InputNumberProps } from '@lobehub/ui';
import styles from './content-production.module.css';

type NumberFieldProps = InputNumberProps & {
  /** Visible caption above the input. */
  caption: string;
  /** Full accessible name, e.g. 「片段 1 入点」. */
  label: string;
  id: string;
};

/**
 * lobe InputNumber names its input through `id` only (aria-label lands on the field root), so the
 * caption stays visible and a hidden `<label htmlFor>` carries the full accessible name.
 */
export function NumberField({ caption, label, ...props }: NumberFieldProps) {
  return (
    <div className={styles.field}>
      <span aria-hidden="true">{caption}</span>
      <label className="sr-only" htmlFor={props.id}>
        {label}
      </label>
      <InputNumber {...props} />
    </div>
  );
}
