import { Input } from '@lobehub/ui';
import { Search } from 'lucide-react';
import type { FormEvent } from 'react';
import styles from './studio-search.module.css';

export interface StudioSearchProps {
  /** Accessible name of the input, e.g. 搜索原片. */
  label: string;
  placeholder?: string;
  defaultValue?: string;
  /** Trimmed keyword; empty string when cleared. */
  onSearch: (keyword: string) => void;
}

/** Keyword search submitted with Enter; clearing searches for everything. The icon sits inside the field. */
export function StudioSearch({ label, placeholder, defaultValue = '', onSearch }: StudioSearchProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('keyword');
    onSearch(typeof value === 'string' ? value.trim() : '');
  };
  return (
    <form className={styles.search} onSubmit={submit}>
      <Input
        name="keyword"
        aria-label={label}
        placeholder={placeholder}
        defaultValue={defaultValue}
        prefix={<Search size={14} strokeWidth={1.8} aria-hidden="true" />}
        allowClear
        onClear={() => onSearch('')}
      />
    </form>
  );
}
