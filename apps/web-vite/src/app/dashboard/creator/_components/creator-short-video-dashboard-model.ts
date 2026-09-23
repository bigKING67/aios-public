import type { DateRange } from './creator-date-range';
import type { CreatorFilterOptionCell } from './creator-detail-filters';
import type { CreatorMetricGridItem } from './creator-metric-grid';
import type { CreatorDashboardTableStateConfig } from './creator-dashboard-table-state';
import {
  formatCurrency,
  formatInteger,
  formatRate,
  toNumber,
  type NumericInput,
} from './creator-formatters';
import {
  CREATOR_COOPERATION_PLATFORM_PRIORITY_ORDER as COOPERATION_PLATFORM_PRIORITY_ORDER,
  formatCreatorCooperationStatusDisplay as formatCooperationStatusDisplay,
  normalizeCreatorCooperationPlatform as normalizeCooperationPlatform,
  normalizeCreatorCooperationStageKey as normalizeBaseCooperationStageKey,
  type CreatorCooperationStageKey as CooperationStageKey,
} from './creator-cooperation-normalizers';
import type {
  CreatorShortVideoAssetArrayFieldKey,
  CreatorShortVideoDetailApiRow,
  CreatorShortVideoDetailRow,
} from './creator-short-video-dashboard-types';
import {
  formatShortVideoRoi,
  hasShortVideoOrderSignal,
  isShortVideoMetricEntityNewInRange,
  resolveShortVideoAdCost,
  resolveShortVideoCooperationFeeKey,
  resolveShortVideoGmv,
  resolveShortVideoGsv,
  resolveShortVideoManualCreatorFeeAmount,
  resolveShortVideoMetricEntityKey,
  resolveShortVideoOrderCount,
  resolveShortVideoQianchuanGmv,
  resolveShortVideoQianchuanGsv,
  normalizeShortVideoMetricKey,
} from './creator-short-video-metrics';
import {
  compactShortVideoArrayValues,
  CREATOR_SHORT_VIDEO_ASSET_ARRAY_FIELD_KEYS,
  formatShortVideoAssetVideoTypeValues,
  normalizeShortVideoArrayValues,
} from './creator-short-video-array-values';

export {
  formatShortVideoRoi,
  hasShortVideoOrderSignal,
  hasShortVideoQianchuanGmv,
  isShortVideoMetricEntityNewInRange,
  isShortVideoPublishedInRange,
  isShortVideoVideoScopedManualAttr,
  normalizeShortVideoMetricKey,
  resolveShortVideoAdCost,
  resolveShortVideoCartRevenue,
  resolveShortVideoCartRoi,
  resolveShortVideoCooperationFeeKey,
  resolveShortVideoGmv,
  resolveShortVideoGsv,
  resolveShortVideoManualCreatorFeeAmount,
  resolveShortVideoMetricEntityKey,
  resolveShortVideoMetricVideoId,
  resolveShortVideoOrderCount,
  resolveShortVideoQianchuanGmv,
  resolveShortVideoQianchuanGsv,
  resolveShortVideoQianchuanRoi,
  resolveShortVideoRefundAmount,
  resolveShortVideoTrafficRevenue,
  resolveShortVideoTrafficRoi,
} from './creator-short-video-metrics';
export { hasShortVideoCartSaleAmount } from './creator-short-video-metrics';
export {
  formatShortVideoAssetVideoType,
  formatShortVideoAssetVideoTypeValues,
} from './creator-short-video-array-values';

export const CREATOR_SHORT_VIDEO_MATCH_STATUS_TAGS = {
  matched_by_id: { label: 'ID匹配', color: 'success' },
  matched_by_name: { label: '名称兜底', color: 'processing' },
  unmatched: { label: '未匹配', color: 'warning' },
} as const;

export const CREATOR_MATCH_STATUS_FALLBACK_TAG = { label: '缺少达人ID' } as const;

export const CREATOR_SHORT_VIDEO_DASHBOARD_CLIENT_CONFIG = {
  dateBoundsEndpoint: '/dashboard/creator/short-video/date-bounds',
  dateBoundsRequestKey: 'creator-shortvideo-date-bounds',
  overviewEndpoint: '/dashboard/creator/short-video/overview',
  overviewRequestKey: 'creator-shortvideo-overview',
  detailsEndpoint: '/dashboard/creator/short-video/details',
  detailsRequestKey: 'creator-shortvideo-details',
  includePreviousDetails: true,
  previousDetailsRequestKey: 'creator-shortvideo-details-previous',
  errorFallbackMessage: '短视频达人看板数据加载失败，请检查迁移与 ETL 刷新状态。',
  loginRedirectPath: '/dashboard/creator/short-video',
} as const;

export const CREATOR_SHORT_VIDEO_METRIC_LABELS = {
  rosterInfluencerCount: '短视频达人数',
  activeInfluencerCount: '达人短视频人数',
  activeContentCount: '达人短视频场数',
  gmv: '达人短视频挂车GMV',
  gsv: '达人短视频挂车GSV（退款时间）',
  refundRate: '短视频退款率',
} as const;

const SHORT_VIDEO_UNNAMED_CREATOR_LABEL = '未命名达人';

function formatSignedShortVideoRate(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }

  const percent = value * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(digits)}%`;
}

function calculateShortVideoRateChange(current: number | null, previous: number | null): number | null {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    Math.abs(previous) < Number.EPSILON
  ) {
    return null;
  }

  return (current - previous) / Math.abs(previous);
}

function resolveShortVideoComparisonTone(value: number | null): 'up' | 'down' | 'neutral' {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 0.000001) {
    return 'neutral';
  }

  return value > 0 ? 'up' : 'down';
}

function isCreatorShortVideoDetailApiRow(value: unknown): value is CreatorShortVideoDetailApiRow {
  return typeof value === 'object' && value !== null;
}

function normalizeShortVideoManualPermission(value: unknown): boolean {
  return value === true;
}

function trimShortVideoText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeShortVideoAssetArrayField(
  key: CreatorShortVideoAssetArrayFieldKey,
  value: unknown
): string[] {
  if (key === 'asset_video_types') {
    return formatShortVideoAssetVideoTypeValues(value);
  }

  return normalizeShortVideoArrayValues(value);
}

export function normalizeCreatorShortVideoDetailRow(
  row: CreatorShortVideoDetailApiRow
): CreatorShortVideoDetailRow {
  const record = row as CreatorShortVideoDetailApiRow & Record<CreatorShortVideoAssetArrayFieldKey, unknown>;
  const normalizedAssetFields = Object.fromEntries(
    CREATOR_SHORT_VIDEO_ASSET_ARRAY_FIELD_KEYS.map((key) => [key, normalizeShortVideoAssetArrayField(key, record[key])])
  ) as Pick<CreatorShortVideoDetailRow, CreatorShortVideoAssetArrayFieldKey>;

  return {
    ...row,
    ...normalizedAssetFields,
    manual_can_edit: normalizeShortVideoManualPermission(row.manual_can_edit),
    manual_can_delete: normalizeShortVideoManualPermission(row.manual_can_delete),
  };
}

const SHORT_VIDEO_REUSED_MANUAL_ATTR_FIELDS = [
  'manual_attr_id',
  'manual_scope_type',
  'manual_platform',
  'manual_author_douyin_id',
  'manual_author_name_snapshot',
  'manual_video_id',
  'manual_product_id',
  'manual_fans_count',
  'manual_fans_count_updated_at',
  'manual_creator_type',
  'manual_mcn',
  'manual_creator_fee_amount',
  'manual_creator_fee_type',
  'manual_creator_fee_note',
  'manual_created_by_user_id',
  'manual_created_by_name',
  'manual_updated_by_user_id',
  'manual_updated_by_name',
  'manual_created_at',
  'manual_updated_at',
  'manual_is_deleted',
  'manual_can_edit',
  'manual_can_delete',
] as const satisfies readonly (keyof CreatorShortVideoDetailRow)[];

type ShortVideoReusableManualAttrField = (typeof SHORT_VIDEO_REUSED_MANUAL_ATTR_FIELDS)[number];
type ShortVideoReusableManualAttrs = Pick<CreatorShortVideoDetailRow, ShortVideoReusableManualAttrField>;

function hasReusableShortVideoManualAttrs(row: CreatorShortVideoDetailRow): boolean {
  return (
    normalizeShortVideoMetricKey(String(row.manual_attr_id ?? '')) !== '' &&
    normalizeShortVideoMetricKey(row.manual_scope_type) === 'video' &&
    normalizeShortVideoMetricKey(row.manual_video_id) === normalizeShortVideoMetricKey(row.video_id) &&
    row.manual_is_deleted !== true
  );
}

function buildReusableShortVideoManualAttrs(row: CreatorShortVideoDetailRow): ShortVideoReusableManualAttrs {
  return Object.fromEntries(
    SHORT_VIDEO_REUSED_MANUAL_ATTR_FIELDS.map((field) => [field, row[field]])
  ) as ShortVideoReusableManualAttrs;
}

function resolveShortVideoManualAttrRecency(row: CreatorShortVideoDetailRow): number {
  const timestamp = Date.parse(row.manual_updated_at || row.manual_created_at || '');
  if (Number.isFinite(timestamp)) {
    return timestamp;
  }

  return Number(row.manual_attr_id ?? 0) || 0;
}

function reuseShortVideoManualAttrsByVideoKey(
  rows: CreatorShortVideoDetailRow[]
): CreatorShortVideoDetailRow[] {
  const manualAttrsByKey = new Map<
    string,
    {
      attrs: ShortVideoReusableManualAttrs;
      recency: number;
    }
  >();

  rows.forEach((row) => {
    const key = resolveShortVideoCooperationFeeKey(row);
    if (!key || !hasReusableShortVideoManualAttrs(row)) {
      return;
    }

    const recency = resolveShortVideoManualAttrRecency(row);
    const current = manualAttrsByKey.get(key);
    if (!current || recency >= current.recency) {
      manualAttrsByKey.set(key, {
        attrs: buildReusableShortVideoManualAttrs(row),
        recency,
      });
    }
  });

  if (!manualAttrsByKey.size) {
    return rows;
  }

  return rows.map((row) => {
    const key = resolveShortVideoCooperationFeeKey(row);
    const reusable = key ? manualAttrsByKey.get(key) : undefined;
    if (!reusable || hasReusableShortVideoManualAttrs(row)) {
      return row;
    }

    return {
      ...row,
      ...reusable.attrs,
    };
  });
}

export function normalizeCreatorShortVideoDetailRows(
  rows: readonly unknown[]
): CreatorShortVideoDetailRow[] {
  const normalizedRows = rows
    .filter(isCreatorShortVideoDetailApiRow)
    .map(normalizeCreatorShortVideoDetailRow);

  return reuseShortVideoManualAttrsByVideoKey(normalizedRows);
}

const SHORT_VIDEO_SUMMARY_SUM_FIELDS = [
  'video_view_count',
  'user_pay_amount',
  'refund_amount',
  'live_room_pay_amount',
  'search_after_view_pay_amount',
  'shop_page_pay_amount',
  'qianchuan_overall_impression_count',
  'qianchuan_overall_click_count',
  'qianchuan_overall_cost',
  'qianchuan_overall_order_count',
  'qianchuan_overall_gmv',
  'qianchuan_user_pay_amount',
  'qianchuan_smart_coupon_amount',
  'qianchuan_platform_subsidy_amount',
  'qianchuan_net_gmv',
  'qianchuan_net_order_count',
  'shortvideo_duration_minutes',
  'shortvideo_view_count',
  'shortvideo_exposure_user_count',
  'shortvideo_product_click_user',
  'shortvideo_order_count',
  'shortvideo_refund_order_count',
  'shortvideo_buyer_count',
  'shortvideo_gmv',
  'shortvideo_user_pay_amount',
  'shortvideo_refund_amount',
  'shortvideo_ad_cost',
  'shortvideo_live_room_pay_amount',
  'shortvideo_search_after_view_pay_amount',
  'shortvideo_shop_page_pay_amount',
] as const satisfies readonly (keyof CreatorShortVideoDetailRow)[];

const SHORT_VIDEO_SUMMARY_ARRAY_FIELDS = [
  'account_types',
  'trade_source_ids',
  'asset_ids',
  'platform_video_ids',
  'ad_material_ids',
  'asset_product_names',
  'asset_owner_names',
  'asset_owner_user_ids',
  'asset_video_types',
  'asset_content_scenes',
  'asset_content_scene_groups',
  'asset_content_scene_subtypes',
  'qianchuan_material_ids',
  'qianchuan_material_video_names',
  'qianchuan_source_file_names',
  'qianchuan_source_ids',
] as const satisfies readonly (keyof CreatorShortVideoDetailRow)[];

function resolveShortVideoSummaryGroupKey(row: CreatorShortVideoDetailRow): string {
  const videoId = normalizeShortVideoMetricKey(row.video_id);
  if (videoId) {
    return `video:${videoId}`;
  }

  const materialId = normalizeShortVideoArrayValues(row.qianchuan_material_ids)[0];
  if (materialId) {
    return `material:${materialId}`;
  }

  const materialKey = normalizeShortVideoMetricKey(row.qianchuan_material_key);
  if (materialKey) {
    return `material-key:${materialKey}`;
  }

  return `row:${row.id}`;
}

function readShortVideoSummaryText(value: unknown): string {
  return String(value ?? '').trim();
}

function pickShortVideoFirstText(...values: unknown[]): string {
  for (const value of values) {
    const text = readShortVideoSummaryText(value);
    if (text) {
      return text;
    }
  }

  return '';
}

function normalizeShortVideoTemporalText(value: unknown): string {
  return readShortVideoSummaryText(value).replace('T', ' ');
}

function pickShortVideoTemporalValue(
  currentValue: string | null | undefined,
  nextValue: string | null | undefined,
  direction: 'min' | 'max'
): string | null {
  const currentText = normalizeShortVideoTemporalText(currentValue);
  const nextText = normalizeShortVideoTemporalText(nextValue);
  if (!nextText) {
    return currentValue || null;
  }
  if (!currentText) {
    return nextValue || null;
  }

  const comparison = nextText.localeCompare(currentText);
  if (direction === 'min') {
    return comparison < 0 ? nextValue || null : currentValue || null;
  }

  return comparison > 0 ? nextValue || null : currentValue || null;
}

function buildShortVideoDistinctArray(rows: readonly CreatorShortVideoDetailRow[], field: keyof CreatorShortVideoDetailRow): unknown[] {
  const seen = new Set<string>();
  const values: unknown[] = [];

  rows.forEach((row) => {
    const rawValue = row[field];
    const candidates = Array.isArray(rawValue) ? rawValue : [rawValue];
    candidates.forEach((candidate) => {
      const text = readShortVideoSummaryText(candidate);
      if (!text || seen.has(text)) {
        return;
      }

      seen.add(text);
      values.push(candidate);
    });
  });

  return values;
}

function calculateShortVideoSummaryRatio(
  numerator: unknown,
  denominator: unknown,
  multiplier = 1
): number | null {
  const denominatorValue = toShortVideoSummaryNumber(denominator);
  if (denominatorValue <= 0) {
    return null;
  }

  return (toShortVideoSummaryNumber(numerator) / denominatorValue) * multiplier;
}

function toShortVideoSummaryNumber(value: unknown): number {
  return toNumber(value as NumericInput);
}

function pickShortVideoMinimumPositiveNumber(rows: readonly CreatorShortVideoDetailRow[], field: keyof CreatorShortVideoDetailRow): number | null {
  const values = rows
    .map((row) => toShortVideoSummaryNumber(row[field]))
    .filter((value) => value > 0);

  return values.length ? Math.min(...values) : null;
}

function buildCreatorShortVideoSummaryRow(
  rows: readonly CreatorShortVideoDetailRow[],
  currentRange: DateRange
): CreatorShortVideoDetailRow {
  const firstRow = rows[0];
  const summaryRow = { ...firstRow } as CreatorShortVideoDetailRow & Record<string, unknown>;
  const summaryRecord = summaryRow as Record<string, unknown>;

  summaryRow.detail_grain = 'period_summary';
  summaryRow.stat_date =
    rows.reduce<string | null>(
      (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.stat_date, 'max'),
      null
    ) || currentRange.end.format('YYYY-MM-DD');

  SHORT_VIDEO_SUMMARY_SUM_FIELDS.forEach((field) => {
    summaryRecord[field] = rows.reduce((total, row) => total + toShortVideoSummaryNumber(row[field]), 0);
  });

  SHORT_VIDEO_SUMMARY_ARRAY_FIELDS.forEach((field) => {
    summaryRecord[field] = buildShortVideoDistinctArray(rows, field);
  });

  summaryRow.qianchuan_material_count =
    (summaryRow.qianchuan_material_ids as unknown[]).length ||
    rows.reduce((maxCount, row) => Math.max(maxCount, toShortVideoSummaryNumber(row.qianchuan_material_count)), 0);
  summaryRow.qianchuan_overall_click_rate = calculateShortVideoSummaryRatio(
    summaryRow.qianchuan_overall_click_count,
    summaryRow.qianchuan_overall_impression_count
  );
  summaryRow.qianchuan_overall_conversion_rate = calculateShortVideoSummaryRatio(
    summaryRow.qianchuan_overall_order_count,
    summaryRow.qianchuan_overall_click_count
  );
  summaryRow.qianchuan_overall_pay_roi = calculateShortVideoSummaryRatio(
    summaryRow.qianchuan_overall_gmv,
    summaryRow.qianchuan_overall_cost
  );
  summaryRow.qianchuan_overall_order_cost = calculateShortVideoSummaryRatio(
    summaryRow.qianchuan_overall_cost,
    summaryRow.qianchuan_overall_order_count
  );
  summaryRow.qianchuan_overall_cpm = calculateShortVideoSummaryRatio(
    summaryRow.qianchuan_overall_cost,
    summaryRow.qianchuan_overall_impression_count,
    1000
  );
  summaryRow.qianchuan_overall_cpc = calculateShortVideoSummaryRatio(
    summaryRow.qianchuan_overall_cost,
    summaryRow.qianchuan_overall_click_count
  );
  summaryRow.qianchuan_net_gmv_roi = calculateShortVideoSummaryRatio(
    summaryRow.qianchuan_net_gmv,
    summaryRow.qianchuan_overall_cost
  );
  summaryRow.qianchuan_net_order_cost = calculateShortVideoSummaryRatio(
    summaryRow.qianchuan_overall_cost,
    summaryRow.qianchuan_net_order_count
  );
  summaryRow.qianchuan_net_gmv_settlement_rate = calculateShortVideoSummaryRatio(
    summaryRow.qianchuan_net_gmv,
    summaryRow.qianchuan_overall_gmv
  );
  summaryRow.watch_to_buyer_rate = calculateShortVideoSummaryRatio(
    summaryRow.shortvideo_buyer_count,
    summaryRow.shortvideo_view_count
  );
  summaryRow.refund_rate = calculateShortVideoSummaryRatio(summaryRow.refund_amount, summaryRow.user_pay_amount);

  summaryRow.shortvideo_count = normalizeShortVideoMetricKey(summaryRow.video_id as string | null | undefined) ? 1 : 0;
  summaryRow.shortvideo_ad_cost = summaryRow.qianchuan_overall_cost;
  summaryRow.shortvideo_gmv = summaryRow.user_pay_amount;
  summaryRow.shortvideo_user_pay_amount = summaryRow.user_pay_amount;
  summaryRow.shortvideo_refund_amount = summaryRow.refund_amount;
  summaryRow.qianchuan_metric_attributed = rows.some((row) => row.qianchuan_metric_attributed);
  summaryRow.qianchuan_attribution_rank = pickShortVideoMinimumPositiveNumber(rows, 'qianchuan_attribution_rank');
  summaryRow.is_matched = rows.some((row) => row.is_matched);
  summaryRow.has_shortvideo_data = rows.some((row) => row.has_shortvideo_data);

  summaryRow.video_title = pickShortVideoFirstText(
    summaryRow.video_title,
    ...(summaryRow.qianchuan_material_video_names as unknown[])
  );
  summaryRow.is_promoted =
    rows.some((row) => normalizeShortVideoArrayValues(row.qianchuan_material_ids).length > 0 || resolveShortVideoAdCost(row) > 0)
      ? '是'
      : firstRow.is_promoted;
  summaryRow.qianchuan_material_created_at_min = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.qianchuan_material_created_at_min, 'min'),
    null
  );
  summaryRow.qianchuan_material_created_at_max = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.qianchuan_material_created_at_max, 'max'),
    null
  );
  summaryRow.trade_created_at = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.trade_created_at, 'min'),
    null
  );
  summaryRow.trade_updated_at = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.trade_updated_at, 'max'),
    null
  );
  summaryRow.trade_source_updated_at = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.trade_source_updated_at, 'max'),
    null
  );
  summaryRow.qianchuan_ingest_time = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.qianchuan_ingest_time, 'max'),
    null
  );
  summaryRow.qianchuan_source_updated_at = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.qianchuan_source_updated_at, 'max'),
    null
  );
  summaryRow.source_max_updated_at = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.source_max_updated_at, 'max'),
    null
  );
  summaryRow.created_at = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.created_at, 'min'),
    null
  );
  summaryRow.updated_at = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.updated_at, 'max'),
    null
  );
  summaryRow.source_etl_loaded_at = rows.reduce<string | null>(
    (currentValue, row) => pickShortVideoTemporalValue(currentValue, row.source_etl_loaded_at, 'max'),
    null
  );

  return summaryRow;
}

export function buildCreatorShortVideoSummaryRows(
  rows: readonly CreatorShortVideoDetailRow[],
  currentRange: DateRange
): CreatorShortVideoDetailRow[] {
  const rowsBySummaryKey = new Map<string, CreatorShortVideoDetailRow[]>();

  rows.forEach((row) => {
    const key = resolveShortVideoSummaryGroupKey(row);
    const groupedRows = rowsBySummaryKey.get(key);
    if (groupedRows) {
      groupedRows.push(row);
    } else {
      rowsBySummaryKey.set(key, [row]);
    }
  });

  return Array.from(rowsBySummaryKey.values()).map((groupedRows) =>
    buildCreatorShortVideoSummaryRow(groupedRows, currentRange)
  );
}

function readFirstShortVideoSortValue(value: unknown): string {
  return normalizeShortVideoArrayValues(value)[0] ?? '';
}

function compareShortVideoPresentFirst(leftHasValue: boolean, rightHasValue: boolean): number {
  return Number(rightHasValue) - Number(leftHasValue);
}

function compareShortVideoTextWithEmptyLast(leftValue: string, rightValue: string): number {
  if (!leftValue && !rightValue) {
    return 0;
  }

  if (!leftValue) {
    return 1;
  }

  if (!rightValue) {
    return -1;
  }

  return leftValue.localeCompare(rightValue, 'zh-CN');
}

function compareCreatorShortVideoDetailRows(
  left: CreatorShortVideoDetailRow,
  right: CreatorShortVideoDetailRow
): number {
  const leftProduct = readFirstShortVideoSortValue(left.asset_product_names);
  const rightProduct = readFirstShortVideoSortValue(right.asset_product_names);
  const leftHasAssetVideo = normalizeShortVideoArrayValues(left.asset_ids).length > 0;
  const rightHasAssetVideo = normalizeShortVideoArrayValues(right.asset_ids).length > 0;
  const leftHasMaterialId = normalizeShortVideoArrayValues(left.qianchuan_material_ids).length > 0;
  const rightHasMaterialId = normalizeShortVideoArrayValues(right.qianchuan_material_ids).length > 0;

  return (
    String(right.stat_date ?? '').localeCompare(String(left.stat_date ?? '')) ||
    compareShortVideoPresentFirst(Boolean(leftProduct), Boolean(rightProduct)) ||
    compareShortVideoTextWithEmptyLast(leftProduct, rightProduct) ||
    compareShortVideoPresentFirst(leftHasAssetVideo, rightHasAssetVideo) ||
    compareShortVideoPresentFirst(leftHasMaterialId, rightHasMaterialId) ||
    (toNumber(right.qianchuan_overall_gmv) - toNumber(left.qianchuan_overall_gmv)) ||
    String(left.influencer_name || left.author_nickname || '').localeCompare(
      String(right.influencer_name || right.author_nickname || ''),
      'zh-CN'
    ) ||
    String(left.video_id || '').localeCompare(String(right.video_id || ''), 'zh-CN') ||
    String(left.id).localeCompare(String(right.id), 'zh-CN')
  );
}

export function sortCreatorShortVideoDetailRows(
  rows: readonly CreatorShortVideoDetailRow[]
): CreatorShortVideoDetailRow[] {
  return [...rows].sort(compareCreatorShortVideoDetailRows);
}

export function resolveShortVideoProductFilterValues(row: CreatorShortVideoDetailRow): string[] {
  const productNames = normalizeShortVideoArrayValues(row.asset_product_names);
  return compactShortVideoArrayValues(productNames, '未维护产品');
}

export function resolveShortVideoSceneFilterValues(row: CreatorShortVideoDetailRow): string[] {
  return compactShortVideoArrayValues(
    [
      ...normalizeShortVideoArrayValues(row.asset_content_scenes),
      ...normalizeShortVideoArrayValues(row.asset_content_scene_groups),
      ...normalizeShortVideoArrayValues(row.asset_content_scene_subtypes),
    ],
    '未维护场景'
  );
}

export function resolveShortVideoOwnerFilterValues(row: CreatorShortVideoDetailRow): string[] {
  return compactShortVideoArrayValues(row.asset_owner_names, '未分配负责人');
}

function resolveShortVideoCreatorFilterLabel(row: CreatorShortVideoDetailRow): string {
  return (
    trimShortVideoText(row.author_nickname) ||
    trimShortVideoText(row.influencer_nickname) ||
    SHORT_VIDEO_UNNAMED_CREATOR_LABEL
  );
}

function resolveShortVideoCreatorFilterValue(label: string): string {
  return label;
}

export function resolveShortVideoCreatorFilterValues(row: CreatorShortVideoDetailRow): CreatorFilterOptionCell {
  const label = resolveShortVideoCreatorFilterLabel(row);

  return {
    label,
    value: resolveShortVideoCreatorFilterValue(label),
  };
}

interface CreatorShortVideoMetricValues {
  totalVideoCount: number;
  newVideoCount: number;
  cooperationFee: number;
  orderedVideoCount: number;
  orderRate: number | null;
  cartGmv: number;
  cartGsv: number;
  qianchuanGmv: number;
  qianchuanGsv: number;
  qianchuanCost: number;
  qianchuanOrderCount: number;
  qianchuanRoi: number | null;
}

function buildShortVideoMetricValues(
  rows: readonly CreatorShortVideoDetailRow[],
  range: DateRange
): CreatorShortVideoMetricValues {
  const videoIds = new Set<string>();
  const newVideoIds = new Set<string>();
  const orderedVideoIds = new Set<string>();
  const creatorFeeByKey = new Map<string, number>();

  let cartGmv = 0;
  let cartGsv = 0;
  let qianchuanGmv = 0;
  let qianchuanGsv = 0;
  let qianchuanCost = 0;
  let qianchuanOrderCount = 0;

  rows.forEach((row) => {
    const entityKey = resolveShortVideoMetricEntityKey(row);
    if (entityKey) {
      videoIds.add(entityKey);
      if (hasShortVideoOrderSignal(row)) {
        orderedVideoIds.add(entityKey);
      }
      if (isShortVideoMetricEntityNewInRange(row, range)) {
        newVideoIds.add(entityKey);
      }
    }

    const creatorFee = resolveShortVideoManualCreatorFeeAmount(row);
    const creatorFeeKey = resolveShortVideoCooperationFeeKey(row);
    if (creatorFee > 0 && creatorFeeKey) {
      creatorFeeByKey.set(creatorFeeKey, Math.max(creatorFeeByKey.get(creatorFeeKey) ?? 0, creatorFee));
    }

    qianchuanCost += resolveShortVideoAdCost(row);
    qianchuanOrderCount += resolveShortVideoOrderCount(row);
    qianchuanGmv += resolveShortVideoQianchuanGmv(row);
    qianchuanGsv += resolveShortVideoQianchuanGsv(row);
    cartGmv += resolveShortVideoGmv(row);
    cartGsv += resolveShortVideoGsv(row);
  });

  const totalVideoCount = videoIds.size;
  const orderedVideoCount = orderedVideoIds.size;
  const orderRate = totalVideoCount > 0 ? orderedVideoCount / totalVideoCount : null;
  const cooperationFee = Array.from(creatorFeeByKey.values()).reduce((total, value) => total + value, 0);
  const qianchuanRoi = qianchuanCost > 0 ? qianchuanGmv / qianchuanCost : null;

  return {
    totalVideoCount,
    newVideoCount: newVideoIds.size,
    cooperationFee,
    orderedVideoCount,
    orderRate,
    cartGmv,
    cartGsv,
    qianchuanGmv,
    qianchuanGsv,
    qianchuanCost,
    qianchuanOrderCount,
    qianchuanRoi,
  };
}

function buildShortVideoMetricComparison(
  current: number | null,
  previous: number | null
): CreatorMetricGridItem['comparison'] {
  const rateChange = calculateShortVideoRateChange(current, previous);

  return {
    value: formatSignedShortVideoRate(rateChange, 2),
    tone: resolveShortVideoComparisonTone(rateChange),
    label: '较上周期',
  };
}

export function buildCreatorShortVideoDashboardMetricCards(
  rows: readonly CreatorShortVideoDetailRow[],
  currentRange: DateRange,
  previousRows: readonly CreatorShortVideoDetailRow[] = [],
  previousRange: DateRange = currentRange
): CreatorMetricGridItem[] {
  const currentValues = buildShortVideoMetricValues(rows, currentRange);
  const previousValues = buildShortVideoMetricValues(previousRows, previousRange);

  return [
    {
      label: '总视频数',
      value: formatInteger(currentValues.totalVideoCount),
      featured: true,
      comparison: buildShortVideoMetricComparison(currentValues.totalVideoCount, previousValues.totalVideoCount),
    },
    {
      label: '新视频数',
      value: formatInteger(currentValues.newVideoCount),
      featured: true,
      comparison: buildShortVideoMetricComparison(currentValues.newVideoCount, previousValues.newVideoCount),
    },
    {
      label: '合作费用',
      value: formatCurrency(currentValues.cooperationFee, 2),
      featured: true,
      comparison: buildShortVideoMetricComparison(currentValues.cooperationFee, previousValues.cooperationFee),
    },
    {
      label: '出单数',
      value: formatInteger(currentValues.orderedVideoCount),
      featured: true,
      comparison: buildShortVideoMetricComparison(currentValues.orderedVideoCount, previousValues.orderedVideoCount),
    },
    {
      label: '出单率',
      value: formatRate(currentValues.orderRate, 2),
      featured: true,
      comparison: buildShortVideoMetricComparison(currentValues.orderRate, previousValues.orderRate),
    },
    {
      label: '挂车GMV',
      value: formatCurrency(currentValues.cartGmv, 2),
      comparison: buildShortVideoMetricComparison(currentValues.cartGmv, previousValues.cartGmv),
    },
    {
      label: '挂车GSV（退款时间）',
      value: formatCurrency(currentValues.cartGsv, 2),
      comparison: buildShortVideoMetricComparison(currentValues.cartGsv, previousValues.cartGsv),
    },
    {
      label: '千川GMV',
      value: formatCurrency(currentValues.qianchuanGmv, 2),
      comparison: buildShortVideoMetricComparison(currentValues.qianchuanGmv, previousValues.qianchuanGmv),
    },
    {
      label: '千川GSV',
      value: formatCurrency(currentValues.qianchuanGsv, 2),
      comparison: buildShortVideoMetricComparison(currentValues.qianchuanGsv, previousValues.qianchuanGsv),
    },
    {
      label: '千川消耗',
      value: formatCurrency(currentValues.qianchuanCost, 2),
      comparison: buildShortVideoMetricComparison(currentValues.qianchuanCost, previousValues.qianchuanCost),
    },
    {
      label: '千川订单数',
      value: formatInteger(currentValues.qianchuanOrderCount),
      comparison: buildShortVideoMetricComparison(currentValues.qianchuanOrderCount, previousValues.qianchuanOrderCount),
    },
    {
      label: '千川ROI',
      value: formatShortVideoRoi(currentValues.qianchuanRoi),
      comparison: buildShortVideoMetricComparison(currentValues.qianchuanRoi, previousValues.qianchuanRoi),
    },
  ];
}

export function normalizeCooperationStageKey(
  cooperationStatusNorm: string | null | undefined,
  cooperationStatusRaw: string | null | undefined
): CooperationStageKey {
  return normalizeBaseCooperationStageKey(cooperationStatusNorm, cooperationStatusRaw, ['已合作挂车', '已挂车']);
}

export const CREATOR_SHORT_VIDEO_TABLE_STATE_CONFIG = {
  anchorLevel: {
    resolveStageKey: normalizeCooperationStageKey,
    formatDisplay: formatCooperationStatusDisplay,
  },
  detail: {
    base: {
      statusMap: CREATOR_SHORT_VIDEO_MATCH_STATUS_TAGS,
      fallbackStatus: CREATOR_MATCH_STATUS_FALLBACK_TAG,
      normalizePlatform: normalizeCooperationPlatform,
      resolveStageKey: normalizeCooperationStageKey,
      formatDisplay: formatCooperationStatusDisplay,
    },
    metrics: {
      contentLabel: '短视频',
      gmvValue: (row) => row.shortvideo_gmv,
      buyerCount: (row) => row.shortvideo_buyer_count,
      orderCount: (row) => row.shortvideo_order_count,
      contentCount: (row) => row.shortvideo_count,
      watchCount: (row) => row.shortvideo_view_count,
      userPayAmount: (row) => row.shortvideo_user_pay_amount,
      refundAmount: (row) => row.shortvideo_refund_amount,
    },
  },
} satisfies CreatorDashboardTableStateConfig<CreatorShortVideoDetailRow>;

export { COOPERATION_PLATFORM_PRIORITY_ORDER, formatCooperationStatusDisplay, normalizeCooperationPlatform };
