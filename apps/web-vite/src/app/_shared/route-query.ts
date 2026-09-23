export function pickQueryValue(searchParams: URLSearchParams, key: string): string | undefined {
  const value = searchParams.get(key);
  return value && value.trim() ? value : undefined;
}

export function getCurrentMonthPeriod(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
