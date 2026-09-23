import type { NowcastQualityTone } from './dashboard-types';

export function normalizeNowcastQualityTone(value: string | null | undefined): NowcastQualityTone {
  if (!value) {
    return 'unknown';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'pass') {
    return 'pass';
  }
  if (normalized === 'alert') {
    return 'alert';
  }
  if (normalized === 'insufficient') {
    return 'insufficient';
  }
  return 'unknown';
}

export function getNowcastQualityStatusLabel(value: string | null | undefined): string {
  const tone = normalizeNowcastQualityTone(value);
  if (tone === 'pass') {
    return '质量通过';
  }
  if (tone === 'alert') {
    return '质量告警';
  }
  if (tone === 'insufficient') {
    return '样本不足';
  }
  return '未知';
}

export function getPredictionConfidenceLabel(value: string | null | undefined): string {
  if (!value) {
    return '--';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'high') {
    return '高';
  }
  if (normalized === 'medium') {
    return '中';
  }
  if (normalized === 'low') {
    return '低';
  }
  return value;
}
