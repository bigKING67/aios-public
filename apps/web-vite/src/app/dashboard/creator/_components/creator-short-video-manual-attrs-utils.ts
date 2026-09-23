import {
  toNullableNumber,
  type NumericInput,
} from './creator-formatters';
import type {
  CreatorShortVideoDetailRow,
  CreatorShortVideoManualAttrsPayload,
} from './creator-short-video-dashboard-types';

export interface CreatorShortVideoManualAttrsDraft {
  fansCount: number | null;
  creatorType: string | null;
  mcn: string | null;
  creatorFeeAmount: number | null;
  creatorFeeNote: string | null;
}

export type ManualTagKind = 'creatorType' | 'mcn';

export interface ManualSelectOption {
  label: string;
  value: string;
  isInput?: boolean;
}

export const CREATOR_TYPE_OPTIONS: ManualSelectOption[] = [
  { label: '美妆护肤', value: '美妆护肤' },
  { label: '彩妆', value: '彩妆' },
  { label: '个护清洁', value: '个护清洁' },
  { label: '洗护发', value: '洗护发' },
  { label: '香氛', value: '香氛' },
  { label: '母婴亲子', value: '母婴亲子' },
  { label: '食品饮料', value: '食品饮料' },
  { label: '服饰穿搭', value: '服饰穿搭' },
  { label: '家居家清', value: '家居家清' },
  { label: '运动户外', value: '运动户外' },
  { label: '宠物', value: '宠物' },
  { label: '数码家电', value: '数码家电' },
  { label: '生活方式', value: '生活方式' },
];

const EXCLUDED_CREATOR_TYPE_VALUES = new Set([
  '头部达人',
  '腰部达人',
  '尾部达人',
  'KOC/素人',
  'KOC',
  '素人',
  '机构达人',
  '其他',
]);

export const CREATOR_TYPE_INPUT_REJECTED_MESSAGE =
  '达人类型请填写美妆护肤等行业/内容标签，不支持头部、腰部、尾部、KOC、机构达人等分层值。';

export function trimToNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim() || '';
  return normalized || null;
}

export function normalizeEditableNumber(value: NumericInput): number | null {
  return toNullableNumber(value);
}

export function hasCreatorShortVideoManualAttrs(row: CreatorShortVideoDetailRow): boolean {
  return trimToNullable(String(row.manual_attr_id ?? '')) !== null;
}

export function normalizeCreatorTypeValue(value: string | null | undefined): string | null {
  const normalized = trimToNullable(value);
  if (!normalized || EXCLUDED_CREATOR_TYPE_VALUES.has(normalized)) {
    return null;
  }

  return normalized;
}

export function appendManualOptionValue(values: string[], value: string | null): string[] {
  if (!value || values.includes(value)) {
    return values;
  }

  return [...values, value];
}

export function normalizeManualSelectInput(value: string | null | undefined): string | null {
  const normalized = trimToNullable(value);
  if (!normalized) {
    return null;
  }

  return normalized
    .split(/[，,、]+/)
    .map((item) => trimToNullable(item))
    .filter(Boolean)
    .at(-1) ?? null;
}

export function normalizeCreatorTypeInput(value: string | null | undefined): string | null {
  return normalizeCreatorTypeValue(normalizeManualSelectInput(value));
}

export function isCreatorTypeInputRejected(value: string | null | undefined): boolean {
  const normalized = normalizeManualSelectInput(value);
  return Boolean(normalized && !normalizeCreatorTypeValue(normalized));
}

export function buildManualSelectOptions(
  baseOptions: ManualSelectOption[],
  candidateValues: Array<string | null | undefined>
): ManualSelectOption[] {
  const optionMap = new Map<string, ManualSelectOption>();

  baseOptions.forEach((option) => {
    optionMap.set(option.value, option);
  });
  candidateValues.forEach((value) => {
    const normalized = trimToNullable(value);
    if (normalized && !optionMap.has(normalized)) {
      optionMap.set(normalized, { label: normalized, value: normalized });
    }
  });

  return Array.from(optionMap.values());
}

export function prependManualSearchOption(
  options: ManualSelectOption[],
  searchValue: string,
  normalizeValue: (value: string | null | undefined) => string | null = normalizeManualSelectInput
): ManualSelectOption[] {
  const normalized = normalizeValue(searchValue);
  if (!normalized || options.some((option) => option.value === normalized)) {
    return options;
  }

  return [{ label: normalized, value: normalized, isInput: true }, ...options];
}

export function filterManualSelectOption(inputValue: string, option?: ManualSelectOption): boolean {
  const normalizedInput = inputValue.trim().toLocaleLowerCase('zh-CN');
  if (!normalizedInput) {
    return true;
  }

  const value = option?.value?.toLocaleLowerCase('zh-CN') ?? '';
  const label = option?.label?.toLocaleLowerCase('zh-CN') ?? '';
  return value.includes(normalizedInput) || label.includes(normalizedInput);
}

export function resolveCreatorShortVideoManualRowKey(row: CreatorShortVideoDetailRow): string {
  const authorKey = trimToNullable(row.author_douyin_id || row.influencer_id)
    || trimToNullable(row.influencer_name)
    || String(row.id);
  const videoKey = trimToNullable(row.video_id) || '';

  return [authorKey, videoKey || String(row.id)].join('::');
}

export function resolveCreatorShortVideoAuthorDouyinId(row: CreatorShortVideoDetailRow): string {
  return trimToNullable(row.author_douyin_id) ?? '';
}

export function resolveCreatorShortVideoAuthorNameSnapshot(row: CreatorShortVideoDetailRow): string | null {
  return trimToNullable(row.author_name_snapshot || row.influencer_name || row.influencer_nickname);
}

export function buildCreatorShortVideoManualDraft(
  row: CreatorShortVideoDetailRow
): CreatorShortVideoManualAttrsDraft {
  return {
    fansCount: normalizeEditableNumber(row.manual_fans_count),
    creatorType: normalizeCreatorTypeValue(row.manual_creator_type),
    mcn: trimToNullable(row.manual_mcn),
    creatorFeeAmount: normalizeEditableNumber(row.manual_creator_fee_amount),
    creatorFeeNote: trimToNullable(row.manual_creator_fee_note),
  };
}

export function buildCreatorShortVideoManualPayload(
  row: CreatorShortVideoDetailRow,
  draft: CreatorShortVideoManualAttrsDraft
): CreatorShortVideoManualAttrsPayload | null {
  const authorDouyinId = resolveCreatorShortVideoAuthorDouyinId(row);
  const videoId = trimToNullable(row.video_id);
  if (!authorDouyinId || !videoId) {
    return null;
  }

  return {
    authorDouyinId,
    authorNameSnapshot: resolveCreatorShortVideoAuthorNameSnapshot(row),
    videoId,
    productId: null,
    fansCount: draft.fansCount,
    creatorType: normalizeCreatorTypeValue(draft.creatorType),
    mcn: trimToNullable(draft.mcn),
    creatorFeeAmount: draft.creatorFeeAmount,
    creatorFeeNote: trimToNullable(draft.creatorFeeNote),
  };
}

export function buildCreatorShortVideoManualDeletePayload(
  row: CreatorShortVideoDetailRow
): CreatorShortVideoManualAttrsPayload | null {
  const authorDouyinId = resolveCreatorShortVideoAuthorDouyinId(row);
  const videoId = trimToNullable(row.video_id);
  if (!authorDouyinId || !videoId) {
    return null;
  }

  return {
    authorDouyinId,
    videoId,
    productId: null,
  };
}

export function formatManualUpdatedAt(value: string | null): string {
  if (!value) {
    return '';
  }

  return value.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '').slice(0, 16);
}
