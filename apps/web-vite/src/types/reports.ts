/**
 * 报告类型定义
 *
 * 统一的报告数据结构。
 * 支持周报、月报、自定义报告等多种类型
 * 提供基础类型扩展，避免代码重复
 */

/**
 * 单个 KPI 指标
 */
export interface KPIMetric {
  key: string;
  label: string;
  value: number;
  display_value: string;
  wow?: number; // week-over-week 环比
  yoy?: number; // year-over-year 同比
  unit?: string;
}

/**
 * 趋势数据点
 */
export interface TrendPoint {
  date: string;
  value: number;
}

/**
 * 趋势数据（含多个数据点）
 */
export interface TrendData {
  metric: string;
  points: TrendPoint[];
}

/**
 * 维度数据（如平台、地区等）
 */
export interface DimensionData {
  [key: string]: unknown; // 灵活的维度数据结构
}

/**
 * 报告结论
 */
export interface Conclusions {
  overall: string;
  highlights: string[];
  risks: string[];
}

/**
 * 报告元数据
 */
export interface ReportMetadata {
  report_type: 'weekly' | 'monthly' | 'custom';
  report_id: string;
  period_start: string;
  period_end: string;
  generated_at: string;
}

/**
 * 通用报告响应 - 基础类型（泛型）
 *
 * 周报、月报都继承这个基础结构，可通过 T 扩展自定义数据
 *
 * 用法示例：
 * ```typescript
 * const weeklyReport: ReportResponse<WeeklyCustomData> = {...}
 * const monthlyReport: ReportResponse<MonthlyCustomData> = {...}
 * ```
 */
export interface ReportResponse<T = unknown> {
  meta: ReportMetadata;
  kpis: KPIMetric[];
  charts: {
    trend_nd: TrendData[]; // n 天趋势（支持灵活的时间范围）
    dimensions: DimensionData[]; // 维度数据（平台、地区等）
  };
  conclusions: Conclusions;
  // 扩展字段，用于报告特定的数据
  custom?: T;
}

/**
 * 周报响应 - 特化版本
 */
export interface WeeklyReportResponse extends ReportResponse<WeeklyCustomData> {
  meta: ReportMetadata & {
    report_type: 'weekly';
  };
}

/**
 * 周报特定数据
 */
export interface WeeklyCustomData {
  week_number?: number;
  day_count?: number;
}

/**
 * 月报响应 - 特化版本
 */
export interface MonthlyReportResponse extends ReportResponse<MonthlyCustomData> {
  meta: ReportMetadata & {
    report_type: 'monthly';
  };
}

/**
 * 月报特定数据
 */
export interface MonthlyCustomData {
  month: number;
  year: number;
  day_count?: number;
  weeks?: string[]; // 包含的周报 ID
}

/**
 * 自定义分析报告响应
 */
export interface CustomAnalysisResponse extends ReportResponse<CustomAnalysisData> {
  meta: ReportMetadata & {
    report_type: 'custom';
  };
}

/**
 * 自定义分析特定数据
 */
export interface CustomAnalysisData {
  analysis_name: string;
  dimensions: string[];
  metrics: string[];
  filters?: Record<string, unknown>;
  sql?: string; // 可选：SQL 查询（用于数据溯源）
}

/**
 * 报告查询选项
 */
export interface ReportQueryOptions {
  report_id: string;
  report_type?: 'weekly' | 'monthly' | 'custom';
  period_start?: string;
  period_end?: string;
  format?: 'json' | 'pdf' | 'markdown';
}

/**
 * 报告列表项
 */
export interface ReportListItem {
  report_id: string;
  report_type: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  title?: string;
}

/**
 * 报告列表响应
 */
export interface ReportListResponse {
  data: ReportListItem[];
  total: number;
  limit: number;
  offset: number;
}
