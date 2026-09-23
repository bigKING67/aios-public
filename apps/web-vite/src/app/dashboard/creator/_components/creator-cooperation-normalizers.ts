import type { CreatorCooperationStageMeta } from './creator-cooperation-stages';

export type CreatorCooperationStageKey =
  | 'unclassified'
  | 'initial_contact'
  | 'not_considering'
  | 'sample_negotiation'
  | 'paused'
  | 'live_started';

export const CREATOR_COOPERATION_PLATFORM_PRIORITY_ORDER = ['抖音', '天猫', '小红书', '多平台', '未归属'];

export function buildCreatorCooperationStageOrder(
  activeStageLabel: string
): ReadonlyArray<CreatorCooperationStageMeta<CreatorCooperationStageKey>> {
  return [
    { key: 'unclassified', label: '-' },
    { key: 'initial_contact', label: '初期建联' },
    { key: 'not_considering', label: '暂不考虑合作' },
    { key: 'sample_negotiation', label: '试样洽谈' },
    { key: 'paused', label: '合作暂停' },
    { key: 'live_started', label: activeStageLabel },
  ];
}

export function buildCreatorCooperationStageLabelOrder(
  stages: ReadonlyArray<CreatorCooperationStageMeta<CreatorCooperationStageKey>>
): string[] {
  return stages.map((stage) => stage.label);
}

export function normalizeCreatorCooperationPlatform(platform: string | null): string {
  const raw = platform?.trim() ?? '';
  if (!raw) {
    return '未归属';
  }

  const splitTokens = raw
    .split(/[\/、,，|+&;；\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const candidateTokens = splitTokens.length ? splitTokens : [raw];

  const normalized = new Set<string>();
  for (const token of candidateTokens) {
    const lower = token.toLowerCase();
    if (token.includes('抖音') || lower.includes('douyin')) {
      normalized.add('抖音');
      continue;
    }
    if (token.includes('天猫') || token.includes('淘宝') || lower.includes('tmall') || lower.includes('taobao')) {
      normalized.add('天猫');
      continue;
    }
    if (token.includes('小红书') || lower.includes('xhs')) {
      normalized.add('小红书');
      continue;
    }
    normalized.add(token);
  }

  if (normalized.size > 1) {
    return '多平台';
  }

  return Array.from(normalized)[0] ?? '未归属';
}

export function normalizeCreatorDetailOwner(ownerName: string | null): string {
  const normalized = ownerName?.trim() ?? '';
  return normalized || '未分配';
}

export function isCreatorUnclassifiedCooperationStatus(value: string | null | undefined): boolean {
  const normalized = (value || '').trim();
  return !normalized || normalized === '-' || normalized === '—' || normalized === '未分类';
}

export function formatCreatorCooperationStatusDisplay(value: string | null | undefined): string {
  const normalized = (value || '').trim();
  if (isCreatorUnclassifiedCooperationStatus(normalized)) {
    return '-';
  }
  return normalized;
}

export function normalizeCreatorCooperationStageKey(
  cooperationStatusNorm: string | null | undefined,
  cooperationStatusRaw: string | null | undefined,
  activeStageMatchers: readonly string[]
): CreatorCooperationStageKey {
  const normalized = (cooperationStatusNorm || cooperationStatusRaw || '').trim();
  if (isCreatorUnclassifiedCooperationStatus(normalized)) {
    return 'unclassified';
  }
  if (normalized.includes('初期建联')) {
    return 'initial_contact';
  }
  if (normalized.includes('暂不考虑合作') || normalized.includes('不考虑合作')) {
    return 'not_considering';
  }
  if (normalized.includes('试样洽谈')) {
    return 'sample_negotiation';
  }
  if (normalized.includes('合作暂停')) {
    return 'paused';
  }
  if (activeStageMatchers.some((matcher) => normalized.includes(matcher))) {
    return 'live_started';
  }
  return 'unclassified';
}
