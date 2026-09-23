import dayjs from 'dayjs';

export function formatCompactNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '暂无';
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '暂无日期';
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : value;
}

export function formatRelativeFromNow(value: string | null | undefined): string {
  if (!value) {
    return '暂无同步';
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value;
  }
  const diffMinutes = Math.max(0, dayjs().diff(parsed, 'minute'));
  if (diffMinutes < 60) {
    return `${diffMinutes || 1} 分钟前`;
  }
  const diffHours = dayjs().diff(parsed, 'hour');
  if (diffHours < 48) {
    return `${diffHours} 小时前`;
  }
  return parsed.format('MM-DD HH:mm');
}

export function trimText(value: string | null | undefined, maxLength: number): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}
