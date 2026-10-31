import type { SelectOption } from '@lobehub/ui';

/**
 * Search match for options whose label is a node (platform chips, owner names): an option may
 * carry a `searchText`; otherwise the label text, title or value is matched, case-insensitively.
 */
export function matchSelectOption<Value>(input: string, option: SelectOption<Value>): boolean {
  const keyword = input.trim().toLocaleLowerCase('zh-CN');
  if (!keyword) return true;
  const { searchText } = option as SelectOption<Value> & { searchText?: string };
  const text =
    searchText ??
    (typeof option.label === 'string' || typeof option.label === 'number' ? String(option.label) : option.title ?? String(option.value ?? ''));
  return text.toLocaleLowerCase('zh-CN').includes(keyword);
}
