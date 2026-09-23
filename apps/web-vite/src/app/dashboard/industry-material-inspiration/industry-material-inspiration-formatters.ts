import type {
  IndustryMaterialMetricValue,
  IndustryMaterialRow,
} from './industry-material-inspiration-types';

export const EMPTY_TEXT = '--';
export const UNKNOWN_INDUSTRY_MATERIAL_BRAND = '待识别';
export const REVIEW_INDUSTRY_MATERIAL_BRAND = '待复核';

const SOURCE_ALIAS_DISPLAY_LABELS = new Map<string, string>([
  ['qianchuan', '千川'],
  ['qianchuan_all_domain', '千川全域'],
  ['yuntu', '云图'],
  ['yuntu_ng', '云图'],
  ['yun tu', '云图'],
] as const);

export function localizeIndustryMaterialUiText(value: string): string {
  const normalized = value.trim();
  const exactLabel = SOURCE_ALIAS_DISPLAY_LABELS.get(normalized.toLocaleLowerCase());
  if (exactLabel) {
    return exactLabel;
  }
  return normalized
    .replace(/\bqianchuan\b/giu, '千川')
    .replace(/\byun\s*tu\b/giu, '云图')
    .replace(/\byuntu\b/giu, '云图');
}

const INDUSTRY_EVIDENCE_DECISION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/小测观察(?:后续)?投放表现/gu, '小样本观察内容表现'],
  [/(?:适合|建议|可以)?继续放量(?:投放)?/gu, '可作为高表现内容表达样本继续观察'],
  [/(?:适合|建议|可以)?放量(?:投放)?/gu, '可作为高表现内容表达样本观察'],
  [/(?:适合|建议|可以)?继续投放/gu, '可继续作为内容表达样本观察'],
  [/(?:暂停|停止)(?:投放)?/gu, '暂缓扩大内容复用'],
  [/(?:需|需要)?优化后再投放/gu, '存在内容表达优化空间'],
  [/再投放/gu, '再观察'],
  [/投放表现|投放效果/gu, '内容表现'],
];

export function normalizeIndustryMaterialEvidenceSummary(value: string): string {
  let normalized = localizeIndustryMaterialUiText(value);
  for (const [pattern, replacement] of INDUSTRY_EVIDENCE_DECISION_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

export const INDUSTRY_MATERIAL_BRANDS = [
  '卡诗',
  '欧莱雅PRO',
  '韩束',
  'OKCS',
  'EHD',
  'SPES',
  '馥绿德雅',
  'Off&Relax',
] as const;

type IndustryMaterialBrand = (typeof INDUSTRY_MATERIAL_BRANDS)[number];

function normalizeSupportedIndustryMaterialBrand(value: string | null | undefined): IndustryMaterialBrand | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return INDUSTRY_MATERIAL_BRANDS.find((brand) => brand.toLocaleLowerCase() === normalized.toLocaleLowerCase()) ?? null;
}

export function resolveIndustryMaterialDisplayBrand(row: IndustryMaterialRow): string {
  const adsBrand = normalizeSupportedIndustryMaterialBrand(row.brandName ?? row.brand);
  if (adsBrand) {
    return adsBrand;
  }
  return row.brandResolutionStatus === 'ambiguous'
    ? REVIEW_INDUSTRY_MATERIAL_BRAND
    : UNKNOWN_INDUSTRY_MATERIAL_BRAND;
}

const BRAND_RESOLUTION_SOURCE_LABELS = {
  manual: '人工确认',
  title: '标题识别',
  metadata: '素材元数据识别',
  visual: '视频画面识别',
  transcript: '视频脚本识别',
  multimodal: '多模态识别',
} as const;

export function formatIndustryMaterialBrandResolutionTooltip(row: IndustryMaterialRow): string | null {
  const source = row.brandResolutionSource
    ? BRAND_RESOLUTION_SOURCE_LABELS[row.brandResolutionSource]
    : null;
  const confidence = row.brandResolutionConfidence;
  const confidenceLabel = confidence === null || confidence === undefined
    ? null
    : `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`;
  const evidenceText = row.brandResolutionEvidence?.evidence[0]?.text?.trim() || null;
  const parts = [source, confidenceLabel, evidenceText].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(' · ') : null;
}

export interface ExposureRangeWan {
  lowerWan: number;
  upperWan: number;
}

export function toFiniteNumber(value: IndustryMaterialMetricValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, '').replace(/%$/, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatInteger(value: IndustryMaterialMetricValue): string {
  const numberValue = toFiniteNumber(value);
  if (numberValue === null) {
    return EMPTY_TEXT;
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(numberValue);
}

export function formatRate(value: IndustryMaterialMetricValue): string {
  const numberValue = toFiniteNumber(value);
  if (numberValue === null) {
    return EMPTY_TEXT;
  }
  const percentValue = Math.abs(numberValue) <= 1 ? numberValue * 100 : numberValue;
  return `${percentValue.toFixed(2)}%`;
}

function formatWanInteger(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(Math.round(value));
}

function unitNumberToWan(value: number, unit: string, fallbackUnit: string): number {
  const resolvedUnit = unit || fallbackUnit;
  if (/亿/u.test(resolvedUnit)) {
    return value * 10_000;
  }
  if (/[万wW]/u.test(resolvedUnit)) {
    return value;
  }
  return value / 10_000;
}

export function parseExposureRangeText(value: string | null | undefined): ExposureRangeWan | null {
  const rawText = value?.trim();
  if (!rawText) {
    return null;
  }

  const matches = Array.from(rawText.matchAll(/(\d+(?:\.\d+)?)\s*([万亿wW]?)/gu));
  if (!matches.length) {
    return null;
  }

  let fallbackUnit = '';
  for (const match of matches) {
    const unit = match[2] ?? '';
    if (unit.trim()) {
      fallbackUnit = unit;
    }
  }
  const values = matches
    .map((match) => unitNumberToWan(Number(match[1]), match[2] ?? '', fallbackUnit))
    .filter((numberValue) => Number.isFinite(numberValue));

  if (!values.length) {
    return null;
  }

  const firstWan = values[0] ?? 0;
  const lastWan = values[values.length - 1] ?? firstWan;
  const lowerWan = Math.min(firstWan, lastWan);
  const upperWan = Math.max(firstWan, lastWan);
  return { lowerWan, upperWan };
}

export function parseLegacyConcatenatedExposureRange(exposureValue: number): ExposureRangeWan | null {
  const wanValue = exposureValue / 10_000;
  if (!Number.isInteger(wanValue) || wanValue < 1000) {
    return null;
  }

  const digits = String(Math.round(wanValue));
  let bestRange: ExposureRangeWan | null = null;
  let bestRatioDelta = Number.POSITIVE_INFINITY;
  for (let splitIndex = 1; splitIndex < digits.length; splitIndex += 1) {
    const lowerText = digits.slice(0, splitIndex);
    const upperText = digits.slice(splitIndex);
    if (upperText.startsWith('0')) {
      continue;
    }
    const lowerWan = Number(lowerText);
    const upperWan = Number(upperText);
    if (!Number.isFinite(lowerWan) || !Number.isFinite(upperWan) || lowerWan <= 0 || upperWan <= lowerWan) {
      continue;
    }
    const ratio = upperWan / lowerWan;
    if (ratio > 3) {
      continue;
    }
    const ratioDelta = Math.abs(ratio - 1);
    if (ratioDelta < bestRatioDelta) {
      bestRatioDelta = ratioDelta;
      bestRange = { lowerWan, upperWan };
    }
  }
  return bestRange;
}

export function parseExposureRange(row: IndustryMaterialRow): ExposureRangeWan | null {
  const parsedRange = parseExposureRangeText(row.exposureRange ?? row.rawExposureCount);
  if (parsedRange) {
    return parsedRange;
  }

  const exposureValue = toFiniteNumber(row.exposure);
  if (exposureValue === null) {
    return null;
  }
  const legacyRange = parseLegacyConcatenatedExposureRange(exposureValue);
  if (legacyRange) {
    return legacyRange;
  }
  const fallbackWan = exposureValue / 10_000;
  return { lowerWan: fallbackWan, upperWan: fallbackWan };
}

export function formatExposureRange(range: ExposureRangeWan | null): string {
  if (!range) {
    return EMPTY_TEXT;
  }
  const lowerWan = Math.round(Math.min(range.lowerWan, range.upperWan));
  const upperWan = Math.round(Math.max(range.lowerWan, range.upperWan));
  if (lowerWan === upperWan) {
    return `${formatWanInteger(lowerWan)}万`;
  }
  return `${formatWanInteger(lowerWan)}-${formatWanInteger(upperWan)}万`;
}

export function calculateAverageExposureRange(rows: IndustryMaterialRow[]): ExposureRangeWan | null {
  const ranges = rows
    .map(parseExposureRange)
    .filter((range): range is ExposureRangeWan => range !== null);
  if (!ranges.length) {
    return null;
  }
  const lowerWan = ranges.reduce((sum, range) => sum + range.lowerWan, 0) / ranges.length;
  const upperWan = ranges.reduce((sum, range) => sum + range.upperWan, 0) / ranges.length;
  return { lowerWan, upperWan };
}

export function calculateAverageRate(rows: IndustryMaterialRow[], key: keyof IndustryMaterialRow): number | null {
  const values = rows
    .map((row) => toFiniteNumber(row[key] as IndustryMaterialMetricValue))
    .filter((value): value is number => value !== null);
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
