import {
  resolvePlatformLegendKey,
  type PlatformLegendColorKey,
} from '@/lib/platform-colors';
import type { CreatorLibraryItem } from './creator-library-types';

export const UNCONFIRMED_PLATFORM_LABEL = '未确认';
export const UNCLASSIFIED_STATUS_VALUE = '未分类';
export const UNCLASSIFIED_STATUS_LABEL = '——';
export const BLACKLIST_STATUS_VALUE = '黑名单';
export const NOT_COOPERABLE_STATUS_VALUE = '❌不合作';

export type CreatorLibraryPlatformTone = PlatformLegendColorKey | 'multi';
export type CreatorLibraryCooperationTone =
  | 'unclassified'
  | 'initialContact'
  | 'sampleNegotiation'
  | 'notConsidering'
  | 'paused'
  | 'liveStarted'
  | 'blacklist'
  | 'notCooperable';

const PLATFORM_SORT_KEY_BY_LABEL: Record<string, string> = {
  抖音: 'douyin',
  多平台: 'duopingtai',
  京东: 'jingdong',
  快手: 'kuaishou',
  淘宝: 'taobao',
  天猫: 'tmall',
  淘系: 'taoxi',
  未确认: 'weiqueren',
  未分类: 'weiqueren',
  未知: 'weiqueren',
  小红书: 'xiaohongshu',
  微信: 'weixin',
  微信小程序: 'weixinxiaochengxu',
};

const TONE_ORDER: Record<CreatorLibraryCooperationTone, number> = {
  unclassified: 0,
  initialContact: 1,
  sampleNegotiation: 2,
  notConsidering: 3,
  paused: 4,
  liveStarted: 5,
  blacklist: 98,
  notCooperable: 99,
};

const textCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
});

export function cleanOptionText(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\uFEFF/g, '');
}

export function isUnconfirmedPlatform(value: string | null | undefined): boolean {
  const normalized = cleanOptionText(value).toLowerCase();
  return (
    !normalized ||
    normalized === 'unknown' ||
    normalized === 'unclassified' ||
    normalized === '未分类' ||
    normalized === '未确认' ||
    normalized === '未知'
  );
}

export function normalizePlatformLabel(value: string | null | undefined): string {
  const normalized = cleanOptionText(value);
  return isUnconfirmedPlatform(normalized) ? UNCONFIRMED_PLATFORM_LABEL : normalized;
}

export function resolvePlatformTone(value: string | null | undefined): CreatorLibraryPlatformTone {
  const label = normalizePlatformLabel(value);
  if (/多平台|全平台|multi/i.test(label)) {
    return 'multi';
  }
  return resolvePlatformLegendKey(label) ?? 'unknown';
}

export function buildPlatformOptionValues(
  values: string[] | undefined,
  options: { includeUnconfirmed?: boolean } = {}
): string[] {
  const nextValues = uniqueTexts((values ?? []).map(normalizePlatformLabel));
  if (options.includeUnconfirmed && !nextValues.includes(UNCONFIRMED_PLATFORM_LABEL)) {
    nextValues.push(UNCONFIRMED_PLATFORM_LABEL);
  }
  return nextValues.sort(comparePlatformLabels);
}

export function buildPlainOptionValues(values: string[] | undefined): string[] {
  return uniqueTexts(values ?? []).sort(compareText);
}

export function normalizeCooperationStatusValue(value: string | null | undefined): string {
  const normalized = cleanOptionText(value);
  const compact = normalized.replace(/\s+/g, '');
  if (!compact || compact === '-' || compact === '—' || compact === UNCLASSIFIED_STATUS_LABEL) {
    return UNCLASSIFIED_STATUS_VALUE;
  }
  if (isNotCooperableStatus(compact)) {
    return NOT_COOPERABLE_STATUS_VALUE;
  }
  if (/^(?:未分类|未确定|待分类|待确认|未知|unknown|unclassified)$/i.test(compact)) {
    return UNCLASSIFIED_STATUS_VALUE;
  }
  if (/^(?:黑名单|拉黑|blacklist)$/i.test(compact)) {
    return BLACKLIST_STATUS_VALUE;
  }
  if (/^(?:初期建联|初联|建联|初步建联|刚建联|沟通中|已联系|联系中)$/.test(compact)) {
    return '初期建联';
  }
  if (/^(?:试样洽谈|寄样洽谈|样品洽谈|寄样|试样|样品|报价中|洽谈中|推进中)$/.test(compact)) {
    return '试样洽谈';
  }
  if (/^(?:暂不考虑合作|不考虑合作|暂不考虑|不考虑|无意向|拒绝合作|拒绝)$/.test(compact)) {
    return '暂不考虑合作';
  }
  if (/^(?:合作暂停|暂停合作|暂停|搁置)$/.test(compact)) {
    return '合作暂停';
  }
  if (/^(?:已合作开播|已合作挂车|已合作|合作中|已开播|开播|已挂车|挂车)$/.test(compact)) {
    return '已合作';
  }
  return normalized === UNCLASSIFIED_STATUS_VALUE ? UNCLASSIFIED_STATUS_VALUE : normalized;
}

export function formatCooperationStatusLabel(value: string | null | undefined): string {
  const normalized = normalizeCooperationStatusValue(value);
  return normalized === UNCLASSIFIED_STATUS_VALUE ? UNCLASSIFIED_STATUS_LABEL : normalized;
}

export function isBlacklistStatus(value: string | null | undefined): boolean {
  return /黑名单|blacklist/i.test(cleanOptionText(value));
}

export function isNotCooperableStatus(value: string | null | undefined): boolean {
  const normalized = cleanOptionText(value).replace(/\s+/g, '');
  return (
    /^(?:X|×|✕|❌)?不合作$/i.test(normalized) ||
    normalized === '不可合作' ||
    normalized === '禁止合作'
  );
}

export function isBlacklistCreator(item: CreatorLibraryItem): boolean {
  return isBlacklistStatus(item.cooperationStatusNorm) || isBlacklistStatus(item.cooperationStatus);
}

export function resolveDisplayCooperationStatus(item: CreatorLibraryItem): string {
  return item.isCooperable
    ? item.cooperationStatus || item.cooperationStatusNorm
    : NOT_COOPERABLE_STATUS_VALUE;
}

export function resolveCooperationStatusTone(
  value: string | null | undefined
): CreatorLibraryCooperationTone {
  const normalized = normalizeCooperationStatusValue(value);
  if (isBlacklistStatus(normalized)) {
    return 'blacklist';
  }
  if (isNotCooperableStatus(normalized)) {
    return 'notCooperable';
  }
  if (normalized === UNCLASSIFIED_STATUS_VALUE) {
    return 'unclassified';
  }
  if (/已合作|开播|合作中|已开播/.test(normalized)) {
    return 'liveStarted';
  }
  if (/暂停|搁置/.test(normalized)) {
    return 'paused';
  }
  if (/不合作|不考虑|暂不|无意向|拒绝/.test(normalized)) {
    return 'notConsidering';
  }
  if (/试样|寄样|洽谈|报价|样品|推进/.test(normalized)) {
    return 'sampleNegotiation';
  }
  if (/建联|初联|初期|沟通|联系|接触/.test(normalized)) {
    return 'initialContact';
  }
  return 'sampleNegotiation';
}

export function buildCooperationStatusOptionValues(values: string[] | undefined): string[] {
  const nextValues = uniqueTexts((values ?? []).map(normalizeCooperationStatusValue));
  if (!nextValues.includes(UNCLASSIFIED_STATUS_VALUE)) {
    nextValues.push(UNCLASSIFIED_STATUS_VALUE);
  }
  if (!nextValues.includes(BLACKLIST_STATUS_VALUE)) {
    nextValues.push(BLACKLIST_STATUS_VALUE);
  }
  if (!nextValues.includes(NOT_COOPERABLE_STATUS_VALUE)) {
    nextValues.push(NOT_COOPERABLE_STATUS_VALUE);
  }
  return nextValues.sort((left, right) => {
    const leftTone = resolveCooperationStatusTone(left);
    const rightTone = resolveCooperationStatusTone(right);
    const toneDiff = TONE_ORDER[leftTone] - TONE_ORDER[rightTone];
    return toneDiff || compareText(left, right);
  });
}

function uniqueTexts(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = cleanOptionText(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function comparePlatformLabels(left: string, right: string): number {
  const pinnedDiff = getPinnedPlatformSortRank(left) - getPinnedPlatformSortRank(right);
  if (pinnedDiff !== 0) {
    return pinnedDiff;
  }
  const leftKey = PLATFORM_SORT_KEY_BY_LABEL[left] ?? left.toLowerCase();
  const rightKey = PLATFORM_SORT_KEY_BY_LABEL[right] ?? right.toLowerCase();
  return leftKey.localeCompare(rightKey, 'en') || compareText(left, right);
}

function getPinnedPlatformSortRank(value: string): number {
  if (/多平台|全平台|multi/i.test(value)) {
    return 1;
  }
  if (isUnconfirmedPlatform(value)) {
    return 2;
  }
  return 0;
}

function compareText(left: string, right: string): number {
  return textCollator.compare(left, right);
}
