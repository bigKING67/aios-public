import { APIError } from '../request';
import { request } from '../request';
import {
  AIOS_API_PATHS,
  type ReportsMonthlyLatestPeriodResponse,
  type ReportsMonthlyMetadata,
  type ReportsMonthlyPeriodsResponse,
  type ReportsMonthlyResponse,
} from '../generated-api-contract';

import {
  CACHE_CONFIG,
  createApiClientError,
  getBackendCacheControl,
  mergeRequestConfig,
} from './request-policy';
import { normalizeQueryValue } from './report-query';

type MonthlyReport = ReportsMonthlyResponse;

export async function getMonthlyReport(
  reportId?: string,
  monthPeriod?: string,
  config?: import('../request').RequestConfig
): Promise<MonthlyReport> {
  try {
    const normalizedReportId = normalizeQueryValue(reportId);
    const normalizedMonthPeriod = normalizeQueryValue(monthPeriod);

    const detailRequestConfig = mergeRequestConfig(config, {
      cancelPrevious: config?.cancelPrevious ?? true,
      requestKey: config?.requestKey || 'monthly-report-detail',
      headers: {
        'X-Cache-Control': getBackendCacheControl(CACHE_CONFIG.WEEKLY_REPORT.revalidate), // 复用周报缓存策略
      },
    });

    // 优先使用 monthPeriod
    if (normalizedMonthPeriod) {
      return await request.get<MonthlyReport>(
        AIOS_API_PATHS.reportMonthlyByPeriod,
        mergeRequestConfig(detailRequestConfig, {
          params: { month_period: normalizedMonthPeriod },
        })
      );
    }

    // 其次使用 reportId
    if (normalizedReportId) {
      return await request.get<MonthlyReport>(
        AIOS_API_PATHS.reportMonthly(normalizedReportId),
        mergeRequestConfig(detailRequestConfig, {
          params: { format: 'json' },
        })
      );
    }

    // 都没提供，使用最新的月份
    try {
      const latestPeriod = await getLatestMonthlyPeriod();
      return await request.get<MonthlyReport>(
        AIOS_API_PATHS.reportMonthly(latestPeriod),
        detailRequestConfig
      );
    } catch {
      throw new APIError('NOT_FOUND', 404, '未找到可用的月报数据');
    }
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取月报数据失败', error);
  }
}

export async function getLatestMonthlyPeriod(): Promise<string> {
  try {
    const response = await request.get<ReportsMonthlyLatestPeriodResponse>(
      AIOS_API_PATHS.reportMonthlyLatestPeriod,
      {
        headers: {
          'X-Cache-Control': getBackendCacheControl(60),
        },
      }
    );
    if (!response?.month_period) {
      throw new APIError('NOT_FOUND', 404, '未找到可用的月份');
    }
    return response.month_period;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取最新月份失败', error);
  }
}

export async function getAllMonthlyPeriods(): Promise<Array<{ value: string; label: string }>> {
  try {
    const response = await request.get<ReportsMonthlyPeriodsResponse>(
      AIOS_API_PATHS.reportMonthlyAllPeriods,
      {
        params: { limit: 50 },
        headers: {
          'X-Cache-Control': getBackendCacheControl(60),
        },
      }
    );
    if (!response?.periods || !Array.isArray(response.periods)) {
      throw new APIError('INVALID_RESPONSE', 0, '月份数据格式不正确');
    }
    return response.periods;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取月份列表失败', error);
  }
}

export async function getMonthlyMetadata(reportId: string): Promise<ReportsMonthlyMetadata> {
  try {
    return await request.get<ReportsMonthlyMetadata>(AIOS_API_PATHS.reportMonthlyMetadata(reportId), {
      headers: {
        'X-Cache-Control': getBackendCacheControl(CACHE_CONFIG.WEEKLY_METADATA.revalidate), // 复用周报元数据缓存
      },
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取月报元数据失败', error);
  }
}
