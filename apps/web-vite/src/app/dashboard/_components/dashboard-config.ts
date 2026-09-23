import { CHART_SERIES_COLORS, DOMAIN_TAXONOMY_COLORS } from '@/lib/domain-taxonomy-colors';
import { frontendEnv } from '@/lib/frontend-env';

export const PLATFORM_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'tmall', label: '天猫' },
  { key: 'douyin', label: '抖音' },
  { key: 'xiaohongshu', label: '小红书' },
  { key: 'jd', label: '京东' },
  { key: 'miniProgram', label: '微信小程序' },
] as const;

export const DASHBOARD_DIMENSION_LIBRARY = {
  business: { label: '生意', subtitle: '经营总览' },
  goods: { label: '商品', subtitle: '商品经营' },
  note: { label: '笔记', subtitle: '内容种草' },
  traffic: { label: '流量', subtitle: '流量分析' },
  wanxiangtai: { label: '万相台', subtitle: '投放数据' },
  live: { label: '直播', subtitle: '直播表现' },
  shortVideo: { label: '短视频', subtitle: '短视频挂车' },
  goodsCard: { label: '商品卡', subtitle: '商品卡经营' },
  qianchuan: { label: '千川', subtitle: '千川投放' },
  xingtu: { label: '星图', subtitle: '星图种草' },
  promotion: { label: '推广', subtitle: '投流加热' },
} as const;

export type GoodsQuadrantKey = 'star' | 'stable' | 'opportunity' | 'longtail';
export type PlatformTabKey = (typeof PLATFORM_TABS)[number]['key'];
export type DashboardDimension = keyof typeof DASHBOARD_DIMENSION_LIBRARY;
export type DateMode = 'day' | 'week' | 'month' | 'year' | 'custom';
export type QueryPlatform = 'overview' | 'taobao' | 'douyin' | 'xhs' | 'jd' | 'wx';
export type NoteMetricKey = 'gmv' | 'gsv' | 'refund_rate' | 'order_count' | 'buyer_count' | 'arpu';

export const GOODS_SCORE_CONFIDENCE_TOOLTIP_TEXT =
  '样本标签按访客与成交人数分层：高样本(访客≥500且成交人数≥30)，中样本(访客≥100且成交人数≥10)，低样本(其余，仅代表统计稳定性)。';
export const GOODS_SCORE_CONFIDENCE_FOOTNOTE_TEXT =
  '高样本(访客≥500且成交人数≥30)｜中样本(访客≥100且成交人数≥10)｜低样本(其余，仅代表统计稳定性)。';

export const SPOTLIGHT_TREND_COLOR = CHART_SERIES_COLORS.series2;
export const NOTE_TEXT_MAX_LENGTH = 67;
export const GOODS_MATRIX_WOW_BASELINE = 0;

export const GOODS_QUADRANT_ORDER: GoodsQuadrantKey[] = ['star', 'stable', 'opportunity', 'longtail'];
const TOPSIS_COLORS = DOMAIN_TAXONOMY_COLORS.topsis;
export const FUNNEL_COLORS = DOMAIN_TAXONOMY_COLORS.funnel;

export const GOODS_QUADRANT_META: Record<
  GoodsQuadrantKey,
  {
    label: string;
    color: string;
    shadowColor: string;
    areaColor: string;
  }
> = {
  star: {
    label: '明星商品',
    color: TOPSIS_COLORS.star.text,
    shadowColor: TOPSIS_COLORS.star.shadow,
    areaColor: TOPSIS_COLORS.star.area,
  },
  stable: {
    label: '稳定盘',
    color: TOPSIS_COLORS.stable.text,
    shadowColor: TOPSIS_COLORS.stable.shadow,
    areaColor: TOPSIS_COLORS.stable.area,
  },
  opportunity: {
    label: '机会商品',
    color: TOPSIS_COLORS.opportunity.text,
    shadowColor: TOPSIS_COLORS.opportunity.shadow,
    areaColor: TOPSIS_COLORS.opportunity.area,
  },
  longtail: {
    label: '低效尾部',
    color: TOPSIS_COLORS.longTail.text,
    shadowColor: TOPSIS_COLORS.longTail.shadow,
    areaColor: TOPSIS_COLORS.longTail.area,
  },
};

export const DASHBOARD_DIMENSIONS_BY_TAB: Record<
  Exclude<PlatformTabKey, 'overview'>,
  readonly DashboardDimension[]
> = {
  tmall: ['business', 'goods', 'traffic', 'wanxiangtai'],
  douyin: ['business', 'live', 'shortVideo', 'goodsCard', 'qianchuan', 'xingtu'],
  xiaohongshu: ['business', 'goods', 'note', 'promotion'],
  jd: ['business', 'goods', 'traffic'],
  miniProgram: ['business', 'goods', 'traffic'],
};

export const DASHBOARD_DIMENSION_PLACEHOLDER_COPY: Record<
  Exclude<DashboardDimension, 'business'>,
  { title: string; description: string; nextStep: string }
> = {
  goods: {
    title: '商品模块建设中',
    description: '当前正在接入商品口径的核心指标、趋势图与明细列表。',
    nextStep: '接入商品榜单与动销指标',
  },
  note: {
    title: '笔记模块建设中',
    description: '当前正在接入笔记发布、互动质量与种草转化相关指标。',
    nextStep: '接入笔记分层表现与内容转化归因指标',
  },
  traffic: {
    title: '流量模块建设中',
    description: '当前正在接入流量口径的来源结构、趋势表现与转化链路。',
    nextStep: '接入流量渠道与漏斗指标',
  },
  wanxiangtai: {
    title: '万相台模块建设中',
    description: '当前正在接入万相台投放效果、计划结构与成本收益指标。',
    nextStep: '接入计划级 ROI 与投放诊断指标',
  },
  live: {
    title: '直播模块建设中',
    description: '当前正在接入直播场次、观看互动与成交转化指标。',
    nextStep: '接入场次拆解与直播间转化指标',
  },
  shortVideo: {
    title: '短视频模块建设中',
    description: '当前正在接入短视频发布、播放互动与引流转化指标。',
    nextStep: '接入内容表现分层与引流链路指标',
  },
  goodsCard: {
    title: '商品卡模块建设中',
    description: '当前正在接入商品卡曝光、点击与成交转化指标。',
    nextStep: '接入商品卡投放与转化漏斗指标',
  },
  qianchuan: {
    title: '千川模块建设中',
    description: '当前正在接入千川投放结构、消耗效率与转化表现指标。',
    nextStep: '接入计划诊断与人群效果指标',
  },
  xingtu: {
    title: '星图模块建设中',
    description: '当前正在接入星图种草投放、达人合作与转化效果相关指标。',
    nextStep: '接入达人内容投放与种草转化归因指标',
  },
  promotion: {
    title: '推广模块建设中',
    description: '当前正在接入小红书推广投放、内容加热与转化表现指标。',
    nextStep: '接入投放计划与内容效果归因指标',
  },
};

export const NOTE_METRIC_OPTIONS: Array<{ label: string; value: NoteMetricKey }> = [
  { label: 'GMV', value: 'gmv' },
  { label: 'GSV（支付时间，预测）', value: 'gsv' },
  { label: '预测全部退款率（支付时间）', value: 'refund_rate' },
  { label: '订单量', value: 'order_count' },
  { label: '成交人数', value: 'buyer_count' },
  { label: '客单价', value: 'arpu' },
];

export const DASHBOARD_OVERVIEW_CACHE_TTL_MS = 30_000;
export const DASHBOARD_OVERVIEW_CACHE_MAX_ENTRIES = 120;

export const DATE_LITERAL_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_LITERAL_PATTERN = /^\d{4}-\d{2}$/;
export const YEAR_LITERAL_PATTERN = /^\d{4}$/;
const DEFAULT_MAX_QUERY_DATE_RANGE_DAYS = 720;
export const MAX_DASHBOARD_QUERY_DAYS = (() => {
  const raw = Number.parseInt(frontendEnv.dashboardMaxQueryDays, 10);
  if (Number.isNaN(raw) || raw < 1) {
    return DEFAULT_MAX_QUERY_DATE_RANGE_DAYS;
  }
  return Math.min(raw, 720);
})();
export const DASHBOARD_RANGE_LIMIT_MESSAGE_KEY = 'dashboard-custom-range-limit';

export const TAB_TO_QUERY_PLATFORM: Record<PlatformTabKey, QueryPlatform> = {
  overview: 'overview',
  tmall: 'taobao',
  douyin: 'douyin',
  xiaohongshu: 'xhs',
  jd: 'jd',
  miniProgram: 'wx',
};

const QUERY_PLATFORM_LABEL_MAP: Record<Exclude<QueryPlatform, 'overview'>, string> = {
  taobao: '天猫',
  douyin: '抖音',
  xhs: '小红书',
  jd: '京东',
  wx: '微信小程序',
};

export function getQueryPlatformLabel(platform: Exclude<QueryPlatform, 'overview'>): string {
  return QUERY_PLATFORM_LABEL_MAP[platform] || platform;
}

export function getNoteMetricLabel(metricKey: string | null | undefined): string {
  if (!metricKey) {
    return 'general';
  }
  return NOTE_METRIC_OPTIONS.find((item) => item.value === metricKey)?.label || metricKey;
}
