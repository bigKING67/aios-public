import type { ReactNode } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { Dayjs } from 'dayjs';
import type {
  DashboardDimension,
  DateMode,
  GoodsQuadrantKey,
  PlatformTabKey,
  QueryPlatform,
} from './dashboard-config';
import type { LiveDetailMetricFormat } from './dashboard-formatters';
import type { DashboardGoodsTableItem } from './dashboard-goods-types';
import type { DashboardLiveDetailRow } from './dashboard-live-types';
import type { DashboardOverviewSeriesRow } from './dashboard-overview-types';

export interface ResolvedDateRange {
  start: Dayjs;
  end: Dayjs;
}

export interface SpotlightMetric {
  key: string;
  heading: string;
  label: string;
  tooltip?: string;
  value: number;
  displayValue: string;
  change: number;
  trend: number[];
}

export interface MetricCard {
  key: string;
  label: string;
  value: string;
  change: number;
}

export interface LiveMetricCard {
  key: string;
  label: string;
  tooltip?: string;
  value: string;
  wow: number | null;
  currentRaw: number | null;
  previousRaw: number | null;
  format: 'currency' | 'integer' | 'number' | 'rate';
}

export type LiveDetailMetricDefinition = {
  key: keyof DashboardLiveDetailRow;
  title: string;
  format: LiveDetailMetricFormat;
  digits?: number;
};

export interface ShareItem {
  name: string;
  gmv: number;
  gsv: number;
}

export interface PlatformCompareItem {
  name: string;
  gmv: number;
  gsv: number;
}

export interface FunnelItem {
  stage: string;
  value: number;
}

export interface LiveFunnelStep {
  key: string;
  label: string;
  value: number;
  widthPercent: number;
  color: string;
  conversionRate?: string;
  conversionLabel?: string;
}

export interface DashboardSnapshot {
  spotlight: SpotlightMetric[];
  metrics: MetricCard[];
  carrierCards: MetricCard[];
  trendLabels: string[];
  trendCurrent: number[];
  trendPrevious: number[];
  trendRows: DashboardOverviewSeriesRow[];
  share: ShareItem[];
  platformCompare: PlatformCompareItem[];
  funnel: FunnelItem[];
}

export interface DashboardDailyNoteRow {
  id: number;
  note_date: string;
  platform: Exclude<QueryPlatform, 'overview'>;
  metric_key: string | null;
  action_text: string;
  reason_text: string;
  summary_text: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardDailyNotesApiResponse {
  startDate: string;
  endDate: string;
  platform: QueryPlatform;
  includeRows?: boolean;
  noteDate?: string;
  rows: DashboardDailyNoteRow[];
  countsByDate: Record<string, number>;
}

export interface DashboardChartProps {
  title: string;
  subtitle?: ReactNode;
  option: EChartsCoreOption;
  headerExtra?: ReactNode;
  footerNote?: ReactNode;
  onPointClick?: (params: unknown) => void;
  onNoteLinkClick?: (noteDate: string) => void;
  chartHeight?: number;
  className?: string;
}

export interface MiniTrendProps {
  id: string;
  values: number[];
  labels: string[];
  color: string;
  formatValue: (value: number) => string;
  variant?: 'default' | 'compact' | 'dense';
}

export interface DashboardInitialState {
  activeDimension: DashboardDimension;
  activeTab: PlatformTabKey;
  dateMode: DateMode;
  dayValue: Dayjs;
  weekValue: Dayjs;
  monthValue: Dayjs;
  yearValue: Dayjs;
  customRange: [Dayjs, Dayjs];
  customRangeExceededLimit: boolean;
}

export type TrendTone = 'up' | 'down' | 'neutral';

export interface GoodsMatrixTooltipData {
  productId?: string;
  productName?: string;
  currGmv?: number;
  prevGmv?: number;
  salesShare?: number | null;
  gmvWow?: number | null;
  quadrantLabel?: string;
  quadrant?: GoodsQuadrantKey;
  topsisScore?: number | null;
  topsisRank?: number | null;
  scoreConfidence?: DashboardGoodsTableItem['scoreConfidence'];
}

export type NowcastQualityTone = 'pass' | 'alert' | 'insufficient' | 'unknown';

export interface MonthlyTrendBucket {
  monthKey: string;
  monthToken: string;
  label: string;
  gmv: number;
  gsv: number;
  refundAmount: number;
}
