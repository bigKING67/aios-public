/**
 * API 相关类型定义
 */

/** API 通用响应包装 */
export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
}

/** API 错误响应 */
export interface ApiError {
  detail?: string;
  message?: string;
  code?: string;
}

/** 分页信息 */
export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

/** 报告元数据 */
export interface ReportMetadata {
  report_type: 'weekly' | 'monthly' | 'custom';
  report_id: string;
  period_start: string;
  period_end: string;
  generated_at: string;
}

/** KPI 指标数据 */
export interface KPIMetric {
  key: string;
  label: string;
  value: number;
  display_value: string;
  wow?: number;
  yoy?: number;
}

/** 报告结论 */
export interface ReportConclusions {
  overall: string;
  highlights: string[];
  risks: string[];
}

/** 周报通用响应基类 */
export interface BaseReportResponse {
  meta: ReportMetadata;
  kpis: KPIMetric[];
  conclusions: ReportConclusions;
}
