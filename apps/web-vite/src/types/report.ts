/**
 * 报告相关类型定义
 */

/** KPI 指标 */
export interface KPI {
  key: string;
  label: string;
  value: number;
  display_value: string;
  wow?: number | null;
  unit: string;
}

/** KPI 卡片（用于卡片组件） */
export interface KPICard {
  key?: string;
  label: string;
  value: string | number;
  wow?: string | number;
}

/** 周报元数据 */
export interface WeeklyReportMetadata {
  report_type: string;
  report_id: string;
  period_start: string;
  period_end: string;
  generated_at: string;
}

/** 周报响应 */
export interface WeeklyReportResponse {
  metadata: WeeklyReportMetadata;
  kpis: KPI[];
  charts: Record<string, unknown>;
  conclusions: string[];
}

/** 周报查询参数 */
export interface WeeklyReportQuery {
  week_period: string; // 如: "2025/2/7~2025/2/13"
}

/** 周报响应（兼容名称） */
export type WeeklyReport = WeeklyReportResponse;

/** 月报响应 */
export interface MonthlyReportResponse {
  metadata: {
    report_type: 'monthly';
    report_id: string;
    period_month: string; // 如: "2025-02"
    generated_at: string;
  };
  kpis: KPI[];
  charts: Record<string, unknown>;
  conclusions: string[];
}
