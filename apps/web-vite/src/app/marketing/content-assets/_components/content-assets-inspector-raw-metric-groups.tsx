import { formatCompactNumber, formatPercent, formatRatio } from '../_lib/content-assets-formatters';
import type { ContentAssetLatestMetrics, ContentAssetLatestMetricsRawRow, ContentAssetPerformanceMaterial } from '../_lib/content-assets-types';
import styles from '../content-assets.module.css';
import aiTabStyles from './content-assets-inspector-ai-tab.module.css';
import provenanceStyles from './content-assets-inspector-performance-provenance.module.css';
import { DetailItem } from './content-assets-inspector-detail-item';

type MetricItem = [label: string, value: string]; type MetricSource = Record<string, unknown>;
type RawMetricFormat = 'currency' | 'date' | 'number' | 'percent' | 'ratio' | 'seconds' | 'status' | 'text';

type RawMetricContext = {
  material: ContentAssetPerformanceMaterial; latestMetrics: MetricSource | null;
  rawRow: MetricSource | null; rawRowCount: number;
};

type RawMetricFieldSpec = {
  label: string;
  keys: string[];
  format: RawMetricFormat;
  fallback?: (context: RawMetricContext) => unknown;
};

type RawMetricGroupSpec = {
  title: string;
  fields: RawMetricFieldSpec[];
};

type RawMetricGroup = {
  title: string;
  items: MetricItem[];
  omittedCount: number;
};

const RAW_METRIC_GROUP_ITEM_LIMIT = 10;

const RAW_METRIC_GROUP_SPECS: RawMetricGroupSpec[] = [
  {
    title: '流量获取',
    fields: [
      rawMetricField('最新统计日', ['latestStatDate', 'latest_stat_date', 'statDate', 'stat_date'], 'date', (context) => context.material.lastStatDate),
      rawMetricField('曝光', ['overallImpressionCount', 'overall_impression_count', 'impressionCount', 'impression_count', 'totalImpressions'], 'number', (context) => context.material.totalImpressions),
      rawMetricField('消耗', ['overallCost', 'overall_cost', 'cost', 'totalCost'], 'currency', (context) => context.material.totalCost),
      rawMetricField('CPM', ['overallCpm', 'overall_cpm', 'cpm'], 'currency', computeMaterialCpm),
      rawMetricField('数据状态', ['dataQualityStatus', 'data_quality_status'], 'status', (context) => context.material.dataQualityStatus),
      rawMetricField('样本状态', ['sampleQualityStatus', 'sample_quality_status'], 'status', (context) => context.material.sampleQualityStatus),
    ],
  },
  {
    title: '点击/播放',
    fields: [
      rawMetricField('点击', ['overallClickCount', 'overall_click_count', 'clickCount', 'click_count', 'totalClicks'], 'number', (context) => context.material.totalClicks),
      rawMetricField('CTR', ['overallClickRate', 'overall_click_rate', 'clickRate', 'click_rate', 'ctr'], 'percent', (context) => context.material.ctr),
      rawMetricField('CPC', ['overallCpc', 'overall_cpc', 'cpc'], 'currency', computeMaterialCpc),
      rawMetricField('播放', ['videoPlayCount', 'video_play_count', 'playCount', 'play_count'], 'number', (context) => context.material.videoPlayCount),
      rawMetricField('2s 播放率', ['playRate2s', 'play_rate_2s', 'play2sRate', 'play_2s_rate'], 'percent'),
      rawMetricField('3s 播放率', ['playRate3s', 'play_rate_3s', 'play3sRate', 'play_3s_rate'], 'percent'),
      rawMetricField('5s 播放率', ['playRate5s', 'play_rate_5s', 'play5sRate', 'play_5s_rate'], 'percent', (context) => context.material.playRate5s),
      rawMetricField('10s 播放率', ['playRate10s', 'play_rate_10s', 'play10sRate', 'play_10s_rate'], 'percent', (context) => context.material.playRate10s),
      rawMetricField('完播率', ['videoCompletePlayRate', 'video_complete_play_rate', 'completePlayRate', 'complete_play_rate'], 'percent', (context) => context.material.videoCompletePlayRate),
      rawMetricField('平均观看时长', ['avgWatchDuration', 'avg_watch_duration', 'averageWatchDuration', 'average_watch_duration'], 'seconds', (context) => context.material.avgWatchDuration),
    ],
  },
  {
    title: '成交转化',
    fields: [
      rawMetricField('订单', ['overallOrderCount', 'overall_order_count', 'orderCount', 'order_count', 'totalOrders'], 'number', (context) => context.material.totalOrders),
      rawMetricField('GMV', ['overallGmv', 'overall_gmv', 'gmv', 'totalGmv'], 'currency', (context) => context.material.totalGmv),
      rawMetricField('支付 ROI', ['overallPayRoi', 'overall_pay_roi', 'payRoi', 'pay_roi', 'roi'], 'ratio', (context) => context.material.payRoi),
      rawMetricField('订单成本', ['overallOrderCost', 'overall_order_cost', 'orderCost', 'order_cost'], 'currency', (context) => context.material.orderCost),
      rawMetricField('CVR', ['overallConversionRate', 'overall_conversion_rate', 'conversionRate', 'conversion_rate', 'cvr'], 'percent', (context) => context.material.cvr),
    ],
  },
  {
    title: '净成交/退款',
    fields: [
      rawMetricField('净 GMV', ['netGmv', 'net_gmv', 'totalNetGmv'], 'currency', (context) => context.material.totalNetGmv),
      rawMetricField('净订单', ['netOrderCount', 'net_order_count', 'totalNetOrders'], 'number', (context) => context.material.totalNetOrders),
      rawMetricField('净 GMV ROI', ['netGmvRoi', 'net_gmv_roi'], 'ratio', (context) => context.material.netGmvRoi),
      rawMetricField('净订单成本', ['netOrderCost', 'net_order_cost'], 'currency', (context) => context.material.netOrderCost),
      rawMetricField('1h 退款订单', ['refundOrderCount1h', 'refund_order_count_1h'], 'number'),
      rawMetricField('1h 退款金额', ['refundAmount1h', 'refund_amount_1h'], 'currency'),
      rawMetricField('1h 退款率', ['refundRate1h', 'refund_rate_1h'], 'percent', (context) => context.material.refundRate1h),
    ],
  },
  {
    title: '结算',
    fields: [
      rawMetricField('净 GMV 结算率', ['netGmvSettlementRate', 'net_gmv_settlement_rate'], 'percent'),
      rawMetricField('净订单结算率', ['netOrderSettlementRate', 'net_order_settlement_rate'], 'percent'),
      rawMetricField('7d 结算 ROI', ['settlementRoi7d', 'settlement_roi_7d'], 'ratio'),
      rawMetricField('7d 结算金额', ['settlementAmount7d', 'settlement_amount_7d'], 'currency'),
      rawMetricField('14d 结算 ROI', ['settlementRoi14d', 'settlement_roi_14d'], 'ratio'),
      rawMetricField('14d 结算金额', ['settlementAmount14d', 'settlement_amount_14d'], 'currency'),
      rawMetricField('30d 结算 ROI', ['settlementRoi30d', 'settlement_roi_30d'], 'ratio'),
      rawMetricField('30d 结算金额', ['settlementAmount30d', 'settlement_amount_30d'], 'currency'),
      rawMetricField('90d 结算 ROI', ['settlementRoi90d', 'settlement_roi_90d'], 'ratio'),
      rawMetricField('90d 结算金额', ['settlementAmount90d', 'settlement_amount_90d'], 'currency'),
    ],
  },
  {
    title: '追投调控',
    fields: [
      rawMetricField('追投策略', ['boostPolicy', 'boost_policy'], 'text'),
      rawMetricField('boost 消耗', ['boostCost', 'boost_cost'], 'currency'),
      rawMetricField('boost 订单', ['boostOrderCount', 'boost_order_count'], 'number'),
      rawMetricField('boost GMV', ['boostGmv', 'boost_gmv'], 'currency'),
      rawMetricField('boost ROI', ['boostPayRoi', 'boost_pay_roi'], 'ratio'),
      rawMetricField('boost 点击率', ['boostClickRate', 'boost_click_rate'], 'percent'),
      rawMetricField('legacy boost 消耗', ['legacyBoostCost', 'legacy_boost_cost'], 'currency'),
      rawMetricField('legacy boost 订单', ['legacyBoostOrderCount', 'legacy_boost_order_count'], 'number'),
      rawMetricField('legacy boost GMV', ['legacyBoostGmv', 'legacy_boost_gmv'], 'currency'),
      rawMetricField('legacy boost ROI', ['legacyBoostRoi', 'legacy_boost_roi'], 'ratio'),
    ],
  },
  {
    title: '直播间承接',
    fields: [
      rawMetricField('归因层级', ['attributionLevel', 'attribution_level', 'liveAcceptanceAttributionLevel', 'live_acceptance_attribution_level'], 'text', (context) => context.material.liveAcceptance?.attributionLevel),
      rawMetricField('承接状态', ['latestLiveAcceptanceStatus', 'latest_live_acceptance_status', 'acceptanceQualityStatus', 'acceptance_quality_status'], 'status', (context) => context.material.liveAcceptance?.acceptanceQualityStatus || context.material.latestLiveAcceptanceStatus),
      rawMetricField('直播日期', ['liveStatDate', 'live_stat_date', 'acceptanceStatDate', 'acceptance_stat_date'], 'date', (context) => context.material.liveAcceptance?.statDate),
      rawMetricField('账号', ['douyinAccountDisplayId', 'douyin_account_display_id'], 'text', (context) => context.material.liveAcceptance?.douyinAccountDisplayId || context.material.douyinAccountDisplayId),
      rawMetricField('看播用户', ['liveWatchUserCount', 'live_watch_user_count'], 'number', (context) => context.material.liveAcceptance?.liveWatchUserCount),
      rawMetricField('商品点击用户', ['liveProductClickUser', 'live_product_click_user'], 'number', (context) => context.material.liveAcceptance?.liveProductClickUser),
      rawMetricField('直播订单', ['liveOrderCount', 'live_order_count'], 'number', (context) => context.material.liveAcceptance?.liveOrderCount),
      rawMetricField('直播 GMV', ['liveGmv', 'live_gmv'], 'currency', (context) => context.material.liveAcceptance?.liveGmv),
      rawMetricField('商品点击率', ['productClickRateUser', 'product_click_rate_user'], 'percent', (context) => context.material.liveAcceptance?.productClickRateUser),
      rawMetricField('观看成交率', ['watchToPayRateUser', 'watch_to_pay_rate_user'], 'percent', (context) => context.material.liveAcceptance?.watchToPayRateUser),
      rawMetricField('点击成交率', ['clickToPayRateUser', 'click_to_pay_rate_user'], 'percent', (context) => context.material.liveAcceptance?.clickToPayRateUser),
    ],
  },
  {
    title: '源文件/入库信息',
    fields: [
      rawMetricField('来源表', ['sourceTable', 'source_table'], 'text', (context) => context.material.sourceTable),
      rawMetricField('material_id', ['materialId', 'material_id'], 'text', (context) => context.material.materialId),
      rawMetricField('ad_material_id', ['adMaterialId', 'ad_material_id'], 'text', (context) => context.material.adMaterialId),
      rawMetricField('platform_video_id', ['platformVideoId', 'platform_video_id'], 'text', (context) => context.material.platformVideoId),
      rawMetricField('源文件', ['sourceFileName', 'source_file_name', 'fileName', 'file_name'], 'text'),
      rawMetricField('源行数', ['sourceRowCount', 'source_row_count'], 'number', (context) => context.rawRowCount),
      rawMetricField('入库时间', ['ingestTime', 'ingest_time', 'importedAt', 'imported_at', 'createdAt', 'created_at'], 'date'),
      rawMetricField('统计范围', ['statDateRange', 'stat_date_range'], 'text', (context) => formatDateRange(context.material.firstStatDate, context.material.lastStatDate)),
    ],
  },
];

export function MaterialRawMetricGroups({ material }: { material: ContentAssetPerformanceMaterial }) {
  const latestMetrics = latestMetricsRecord(material.latestMetrics);
  const rawRows = latestMetricRawRows(material.latestMetrics);
  const rawRowCount = rawRows.length;
  const boostPolicy = latestMetrics?.boostPolicy || latestMetrics?.boost_policy;
  const fieldGroups = buildRawMetricGroups(material, latestMetrics, rawRows);

  return (
    <div className={provenanceStyles.mappingProvenancePanel}>
      <div className={provenanceStyles.mappingProvenanceHeader}>
        <strong>latestMetrics / raw_metrics 字段组</strong>
        <span>
          {rawRowCount > 0
            ? `raw sourceRows ${rawRowCount} 行；每组最多 ${RAW_METRIC_GROUP_ITEM_LIMIT} 项`
            : '按 summary / material 字段展示'}
        </span>
      </div>
      <p>
        展示千川全域素材表现回填字段；boost_* / legacy_boost_* 只作追投调控解释项，不并入 overall_* 主口径。
        overall_* 是素材表现主口径，net_* 是成交质量口径；源文件和入库字段用于审计 raw -&gt; DWD/DWS 的 provenance。
      </p>
      {boostPolicy ? <p>{String(boostPolicy)}</p> : null}
      <div className={styles.detailGrid} aria-label="千川全域素材表现完整字段组">
        {fieldGroups.map((group) => (
          <div key={group.title} className={provenanceStyles.mappingProvenancePanel}>
            <div className={provenanceStyles.mappingProvenanceHeader}>
              <strong>{group.title}</strong>
              <span>{group.items.length > 0 ? `${group.items.length} 项` : '暂无该组字段'}</span>
            </div>
            {group.items.length > 0 ? <MetricGrid items={group.items} /> : <p>暂无该组字段</p>}
            {group.omittedCount > 0 ? <p>已省略 {group.omittedCount} 项低优先字段，避免完整 raw_metrics 过量渲染。</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function rawMetricField(
  label: string,
  keys: string[],
  format: RawMetricFormat,
  fallback?: (context: RawMetricContext) => unknown
): RawMetricFieldSpec {
  return { label, keys, format, fallback };
}

function buildRawMetricGroups(
  material: ContentAssetPerformanceMaterial,
  latestMetrics: MetricSource | null,
  rawRows: ContentAssetLatestMetricsRawRow[]
): RawMetricGroup[] {
  const context: RawMetricContext = {
    material,
    latestMetrics,
    rawRow: rawRows[0] || null,
    rawRowCount: rawRows.length,
  };

  return RAW_METRIC_GROUP_SPECS.map((group) => {
    const allItems = group.fields
      .map((field) => resolveRawMetricItem(field, context))
      .filter((item): item is MetricItem => Boolean(item));
    return {
      title: group.title,
      items: allItems.slice(0, RAW_METRIC_GROUP_ITEM_LIMIT),
      omittedCount: Math.max(0, allItems.length - RAW_METRIC_GROUP_ITEM_LIMIT),
    };
  });
}

function resolveRawMetricItem(field: RawMetricFieldSpec, context: RawMetricContext): MetricItem | null {
  const metricValue = firstKnownMetricValue([
    ...field.keys.map((key) => readMetricValue(context.latestMetrics, key)),
    ...field.keys.map((key) => readMetricValue(context.rawRow, key)),
    field.fallback?.(context),
  ]);
  const formatted = formatRawMetricValue(metricValue, field.format);
  return formatted === '--' ? null : [field.label, formatted];
}

function readMetricValue(source: MetricSource | null, key: string): unknown {
  if (!source || !(key in source)) return undefined;
  return source[key];
}

function firstKnownMetricValue(values: unknown[]): unknown {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }
  return undefined;
}

function formatRawMetricValue(value: unknown, format: RawMetricFormat): string {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return '--';
  if (format === 'text' || format === 'date') return formatTextMetricValue(value);
  if (format === 'status') return statusDisplay(formatTextMetricValue(value));

  const numeric = metricNumber(value);
  if (numeric == null) return formatTextMetricValue(value);

  switch (format) {
    case 'currency':
      return formatCurrency(numeric);
    case 'number':
      return formatCompactNumber(numeric);
    case 'percent':
      return formatPercentMetricValue(value, numeric);
    case 'ratio':
      return formatRatio(numeric);
    case 'seconds':
      return formatSeconds(numeric);
    default:
      return formatTextMetricValue(value);
  }
}

function formatPercentMetricValue(value: unknown, numeric: number): string {
  if (typeof value === 'string' && value.includes('%')) return value.trim();
  const normalized = Math.abs(numeric) > 1 && Math.abs(numeric) <= 100 ? numeric / 100 : numeric;
  return formatPercent(normalized);
}

function formatTextMetricValue(value: unknown): string {
  if (typeof value === 'string') return value.trim() || '--';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} 项`;
  if (isMetricSource(value)) return trimMetricText(JSON.stringify(value));
  return String(value || '--');
}

function trimMetricText(value: string): string {
  return value.length > 96 ? `${value.slice(0, 93)}...` : value;
}

function metricNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[,%￥¥,\s]/gu, '').trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function computeMaterialCpm(context: RawMetricContext): number | null {
  const impressions = context.material.totalImpressions;
  if (!impressions) return null;
  return (context.material.totalCost / impressions) * 1000;
}

function computeMaterialCpc(context: RawMetricContext): number | null {
  const clicks = context.material.totalClicks;
  if (!clicks) return null;
  return context.material.totalCost / clicks;
}

function latestMetricsRecord(metrics: ContentAssetLatestMetrics | null | undefined): MetricSource | null {
  return isMetricSource(metrics) ? metrics : null;
}

function latestMetricRawRows(metrics: ContentAssetLatestMetrics | null | undefined): ContentAssetLatestMetricsRawRow[] {
  const record = latestMetricsRecord(metrics);
  if (!record) return [];
  const rowValues = [
    record.sourceRows,
    record.source_rows,
    record.rawMetrics,
    record.raw_metrics,
    record.rawRows,
    record.raw_rows,
    record.sourceRow,
    record.source_row,
  ];
  for (const value of rowValues) {
    const rows = normalizeRawMetricRows(value);
    if (rows.length > 0) return rows;
  }
  return [];
}

function normalizeRawMetricRows(value: unknown): ContentAssetLatestMetricsRawRow[] {
  if (Array.isArray(value)) return value.filter(isMetricSource);
  return isMetricSource(value) ? [value] : [];
}

function isMetricSource(value: unknown): value is MetricSource {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function MetricGrid({ items }: { items: MetricItem[] }) {
  return (
    <div className={aiTabStyles.performanceMetricGrid}>
      {items.map(([label, value]) => <MiniMetric key={label} label={label} value={value} />)}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <DetailItem label={label} value={<code className={aiTabStyles.metricValue}>{value || '--'}</code>} />
  );
}

function formatCurrency(value: number | null | undefined): string {
  const formatted = formatCompactNumber(value);
  return formatted === '--' ? '--' : `¥${formatted}`;
}

function formatSeconds(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '--' : `${Math.round(value)}s`;
}

function formatDateRange(start: string | null, end: string | null): string {
  return start && end && start !== end ? `${start} 至 ${end}` : start || end || '无日期';
}

function statusDisplay(value: string | null | undefined): string {
  const normalized = typeof value === 'string' ? value.trim() : ''; if (!normalized) return '--';
  const labels: Record<string, string> = {
    ok: '正常',
    healthy: '正常',
    matched: '已匹配',
    unique: '唯一命中',
    ambiguous: '多条候选',
    missing_binding: '缺素材绑定',
    duplicate_binding: '重复绑定',
    duplicate_material_date: '同素材同日重复',
    insufficient_sample: '样本不足',
    missing_live_acceptance: '缺直播承接',
    data_only: '仅数据',
    content_only: '仅内容',
    data_content_fusion: '数据内容融合',
    fusion: '数据内容融合',
    insufficient_data: '证据不足',
    warning: '需关注',
    error: '异常',
    failed: '失败',
    unknown: '未知',
  };
  return labels[normalized] || normalized;
}
