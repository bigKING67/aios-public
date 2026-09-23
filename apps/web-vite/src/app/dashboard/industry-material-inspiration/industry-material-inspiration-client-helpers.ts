import type { Key } from 'react';
import dayjs from 'dayjs';
import { APIError } from '@/lib/request';
import { escapeCsvCell } from '../_components/dashboard-formatters';
import { normalizeIndustryMaterialMonth } from './industry-material-inspiration-api';
import {
  EMPTY_TEXT,
  calculateAverageExposureRange,
  calculateAverageRate,
  formatExposureRange,
  formatInteger,
  formatRate,
  INDUSTRY_MATERIAL_BRANDS,
  parseExposureRange,
  resolveIndustryMaterialDisplayBrand,
  toFiniteNumber,
  UNKNOWN_INDUSTRY_MATERIAL_BRAND,
} from './industry-material-inspiration-formatters';
import type {
  IndustryMaterialDouyinTab,
  IndustryMaterialMetricValue,
  IndustryMaterialRow,
  IndustryMaterialSummary,
  IndustryMaterialTab,
} from './industry-material-inspiration-types';

export interface IndustryMaterialTableRow extends IndustryMaterialRow {
  rowKey: Key;
}

export interface SummaryMetric {
  label: string;
  value: string;
  helper: string;
}

export const DEFAULT_TAB: IndustryMaterialTab = 'douyin_live_lead_short_video';
export const ALL_BRANDS_KEY = 'all';
export const ALL_BRANDS_LABEL = '全部';
export const TABLE_SCROLL_X = 2700;
export const FALLBACK_BRAND_FILTER_OPTIONS = [
  ...INDUSTRY_MATERIAL_BRANDS.map((brand) => ({ label: brand, value: brand })),
  { label: UNKNOWN_INDUSTRY_MATERIAL_BRAND, value: '__unknown' },
];

const INDUSTRY_MATERIAL_DETAIL_EXPORT_HEADERS = [
  '排名',
  '品牌',
  '视频标题',
  '产品',
  '核心人群',
  '营销卖点',
  '曝光',
  '完播率',
  'CTR',
  'CVR',
  '3S播放率',
  '5S播放率',
  '互动率',
  'PVR',
  '资产ID/视频归档链接',
] as const;

export const TAB_ITEMS = [
  {
    key: 'douyin_live_lead_short_video',
    label: '抖音直播引流短视频',
  },
  {
    key: 'douyin_goods_short_video',
    label: '抖音带货短视频',
  },
  {
    key: 'xhs_note',
    label: '小红书笔记',
  },
] satisfies Array<{ key: IndustryMaterialTab; label: string }>;

export function normalizeTab(value: string | null): IndustryMaterialTab {
  if (
    value === 'douyin_live_lead_short_video' ||
    value === 'douyin_goods_short_video' ||
    value === 'xhs_note'
  ) {
    return value;
  }
  return DEFAULT_TAB;
}

export function isDouyinMaterialTab(tab: IndustryMaterialTab): tab is IndustryMaterialDouyinTab {
  return tab === 'douyin_live_lead_short_video' || tab === 'douyin_goods_short_video';
}

export function resolveTabLabel(tab: IndustryMaterialTab): string {
  return TAB_ITEMS.find((item) => item.key === tab)?.label ?? '行业素材';
}

export function resolveInitialMonth(searchParams: URLSearchParams): string | null {
  return normalizeIndustryMaterialMonth(searchParams.get('month'));
}

export function normalizeBrandKey(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized || normalized === ALL_BRANDS_KEY) {
    return ALL_BRANDS_KEY;
  }
  return normalized;
}

export function resolveInitialBrandKey(searchParams: URLSearchParams): string {
  return normalizeBrandKey(searchParams.get('brand'));
}

export function formatMonthLabel(month: string): string {
  return normalizeIndustryMaterialMonth(month) ? `${month.slice(0, 4)} 年 ${month.slice(5)} 月` : month;
}

export function resolveText(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return EMPTY_TEXT;
}

function resolveAssetId(row: IndustryMaterialRow): Key | null {
  return row.assetId ?? null;
}

export function resolveAssetHref(row: IndustryMaterialRow): string | null {
  const assetId = resolveAssetId(row);
  if (assetId === null || assetId === '') {
    return null;
  }
  return `/marketing/content-assets/${encodeURIComponent(String(assetId))}`;
}

export function resolveRowKey(row: IndustryMaterialRow, index: number): Key {
  return (
    row.id ??
    row.recordId ??
    `${row.statMonth || row.month || 'month'}-${resolveIndustryMaterialDisplayBrand(row)}-${resolveText(
      row.title,
      row.videoTitle,
      row.assetId
    )}-${index}`
  );
}

function resolveMetricValue(
  summaryValue: IndustryMaterialMetricValue,
  fallbackValue: IndustryMaterialMetricValue
): IndustryMaterialMetricValue {
  return toFiniteNumber(summaryValue) === null ? fallbackValue : summaryValue;
}

export function buildSummaryMetrics(
  rows: IndustryMaterialRow[],
  summary: IndustryMaterialSummary | null
): SummaryMetric[] {
  const averageExposureRange = calculateAverageExposureRange(rows);
  const avgCompletionRate = calculateAverageRate(rows, 'completionRate');
  const avgCtr = calculateAverageRate(rows, 'ctr');
  const avgCvr = calculateAverageRate(rows, 'cvr');
  const avgPlay3sRate = calculateAverageRate(rows, 'play3sRate');
  const avgPlay5sRate = calculateAverageRate(rows, 'play5sRate');
  const avgInteractionRate = calculateAverageRate(rows, 'interactionRate');
  const avgPvr = calculateAverageRate(rows, 'pvr');

  return [
    {
      label: '曝光',
      value: formatExposureRange(averageExposureRange),
      helper: rows.length
        ? `当前 ${formatInteger(rows.length)} 条素材曝光区间下限/上限均值`
        : '当前结果集素材曝光区间下限/上限均值',
    },
    {
      label: '平均完播率',
      value: formatRate(resolveMetricValue(summary?.avgCompletionRate, avgCompletionRate)),
      helper: '素材行均值，仅作筛选参考',
    },
    {
      label: '平均 CTR',
      value: formatRate(resolveMetricValue(summary?.avgCtr, avgCtr)),
      helper: '点击率均值',
    },
    {
      label: '平均 CVR',
      value: formatRate(resolveMetricValue(summary?.avgCvr, avgCvr)),
      helper: '转化率均值',
    },
    {
      label: '平均 3S播放率',
      value: formatRate(resolveMetricValue(summary?.avgPlay3sRate, avgPlay3sRate)),
      helper: '3 秒播放率均值',
    },
    {
      label: '平均 5S播放率',
      value: formatRate(resolveMetricValue(summary?.avgPlay5sRate, avgPlay5sRate)),
      helper: '5 秒播放率均值',
    },
    {
      label: '平均互动率',
      value: formatRate(resolveMetricValue(summary?.avgInteractionRate, avgInteractionRate)),
      helper: '互动率均值',
    },
    {
      label: '平均 PVR',
      value: formatRate(resolveMetricValue(summary?.avgPvr, avgPvr)),
      helper: 'PVR 均值',
    },
  ];
}

export function normalizeMonthOptions(availableMonths: readonly string[]): string[] {
  const monthSet = new Set<string>();
  for (const month of availableMonths) {
    const normalized = normalizeIndustryMaterialMonth(month);
    if (normalized) {
      monthSet.add(normalized);
    }
  }
  return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
}

export function normalizeAvailableMonths(activeMonth: string | null, availableMonths: readonly string[]): string[] {
  const monthSet = new Set(normalizeMonthOptions(availableMonths));
  if (activeMonth) {
    monthSet.add(activeMonth);
  }
  return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
}

export function resolveErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '行业素材灵感数据加载失败，请检查接口、鉴权或 ADS 刷新状态。';
}

function sanitizeCsvFileNamePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveBrandFilterFilePart(selectedBrandKey: string, selectedBrandLabel: string): string {
  if (selectedBrandKey === ALL_BRANDS_KEY) {
    return ALL_BRANDS_LABEL;
  }
  return selectedBrandLabel || '品牌筛选';
}

export function writeControlParams({
  currentParams,
  nextTab,
  nextMonth,
  nextBrandKey,
}: {
  currentParams: URLSearchParams;
  nextTab: IndustryMaterialTab;
  nextMonth: string | null;
  nextBrandKey: string;
}): URLSearchParams {
  const normalizedBrandKey = isDouyinMaterialTab(nextTab) ? normalizeBrandKey(nextBrandKey) : ALL_BRANDS_KEY;
  const nextParams = new URLSearchParams(currentParams);
  nextParams.set('tab', nextTab);
  if (nextMonth) {
    nextParams.set('month', nextMonth);
  } else {
    nextParams.delete('month');
  }
  if (normalizedBrandKey === ALL_BRANDS_KEY) {
    nextParams.delete('brand');
  } else {
    nextParams.set('brand', normalizedBrandKey);
  }
  return nextParams;
}

function resolveAssetExportValue(row: IndustryMaterialRow): string {
  const assetId = resolveAssetId(row);
  const assetHref = resolveAssetHref(row);
  if (assetId === null || assetId === '' || !assetHref) {
    return '';
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${String(assetId)} | ${window.location.origin}${assetHref}`;
  }
  return String(assetId);
}

export function buildIndustryMaterialDetailCsvText(rows: readonly IndustryMaterialTableRow[]): string {
  const csvRows = rows.map((row) =>
    [
      formatInteger(row.rank),
      resolveIndustryMaterialDisplayBrand(row),
      resolveText(row.title, row.videoTitle),
      resolveText(row.product, row.productName),
      resolveText(row.audience),
      resolveText(row.sellingPoint),
      formatExposureRange(parseExposureRange(row)),
      formatRate(row.completionRate),
      formatRate(row.ctr),
      formatRate(row.cvr),
      formatRate(row.play3sRate),
      formatRate(row.play5sRate),
      formatRate(row.interactionRate),
      formatRate(row.pvr),
      resolveAssetExportValue(row),
    ]
      .map((cell) => escapeCsvCell(cell === EMPTY_TEXT ? '' : cell))
      .join(',')
  );
  return ['\uFEFF' + INDUSTRY_MATERIAL_DETAIL_EXPORT_HEADERS.join(','), ...csvRows].join('\n');
}

export function buildIndustryMaterialDetailCsvFileName({
  activeTabLabel,
  displayMonth,
  selectedBrandKey,
  selectedBrandLabel,
}: {
  activeTabLabel: string;
  displayMonth: string;
  selectedBrandKey: string;
  selectedBrandLabel: string;
}): string {
  const timestamp = dayjs().format('YYYYMMDD-HHmmss');
  const brandPart = resolveBrandFilterFilePart(selectedBrandKey, selectedBrandLabel);
  return [
    '行业素材灵感',
    activeTabLabel,
    displayMonth,
    brandPart,
    timestamp,
  ]
    .map(sanitizeCsvFileNamePart)
    .filter(Boolean)
    .join('-')
    .concat('.csv');
}

export function buildBrandFilterOptions(
  brandOptions: readonly { key: string; label: string }[] | undefined
): Array<{ label: string; value: string }> {
  const scopedOptions = brandOptions?.length
    ? brandOptions.map((brand) => ({ label: brand.label, value: brand.key }))
    : FALLBACK_BRAND_FILTER_OPTIONS;
  return [{ label: ALL_BRANDS_LABEL, value: ALL_BRANDS_KEY }, ...scopedOptions];
}

export function resolveSelectedBrandLabel({
  selectedBrandKey,
  selectedBrand,
  brandOptions,
}: {
  selectedBrandKey: string;
  selectedBrand: { key: string; label: string } | null | undefined;
  brandOptions: readonly { key: string; label: string }[] | undefined;
}): string {
  if (selectedBrandKey === ALL_BRANDS_KEY) {
    return ALL_BRANDS_LABEL;
  }
  return (
    selectedBrand?.label ??
    brandOptions?.find((brand) => brand.key === selectedBrandKey)?.label ??
    FALLBACK_BRAND_FILTER_OPTIONS.find((brand) => brand.value === selectedBrandKey)?.label ??
    selectedBrandKey
  );
}
