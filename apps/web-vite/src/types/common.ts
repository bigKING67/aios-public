/**
 * 通用类型定义
 */

/** 时间范围 */
export interface DateRange {
  startDate: string;
  endDate: string;
}

/** 筛选状态 */
export interface FilterState {
  dateRange?: DateRange;
  weekPeriod?: string;
  monthPeriod?: string;
  platform?: string[];
  [key: string]: unknown;
}

/** 加载状态 */
export interface LoadingState {
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
}

/** 分析维度 */
export interface AnalysisDimension {
  name: string;
  label: string;
  values: string[];
}

/** 用户信息 */
export interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
}
