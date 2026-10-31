import { Button, Input } from '@lobehub/ui';
import { Search } from 'lucide-react';
import { useState } from 'react';
import styles from './content-production.module.css';

interface ProductionSearchFieldProps {
  /** Accessible name of the text box. */
  label: string;
  placeholder?: string;
  maxLength?: number;
  /** Controlled text; omit to let the field keep its own. */
  value?: string;
  onChange?: (value: string) => void;
  /** Enter, the 搜索 button, and clearing the text all search. */
  onSearch: (value: string) => void;
  loading?: boolean;
  allowClear?: boolean;
}

/** Text box with a 搜索 button (lobe Input has no search variant). */
export function ProductionSearchField({ label, placeholder, maxLength, value, onChange, onSearch, loading, allowClear }: ProductionSearchFieldProps) {
  const [ownValue, setOwnValue] = useState('');
  const current = value ?? ownValue;
  const change = (next: string) => {
    if (value === undefined) setOwnValue(next);
    onChange?.(next);
  };
  return (
    <div className={styles.searchField}>
      <Input
        aria-label={label}
        placeholder={placeholder}
        maxLength={maxLength}
        value={current}
        allowClear={allowClear}
        prefix={<Search size={14} strokeWidth={1.8} aria-hidden="true" />}
        onChange={(event) => change(event.target.value)}
        onClear={() => {
          change('');
          onSearch('');
        }}
        onPressEnter={() => onSearch(current)}
      />
      <Button loading={loading} onClick={() => onSearch(current)}>
        搜索
      </Button>
    </div>
  );
}
