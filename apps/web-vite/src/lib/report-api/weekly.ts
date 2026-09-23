import type { RequestConfig } from '../request';
import { request } from '../request';
import {
  AIOS_API_PATHS,
  type ReportsListResponse,
  type ReportsWeeklyLatestPeriodResponse,
  type ReportsWeeklyMetadata,
  type ReportsWeeklyPeriodsResponse,
  type ReportsWeeklyResponse,
} from '../generated-api-contract';

import { APIError } from '../request';
import {
  CACHE_CONFIG,
  createApiClientError,
  getBackendCacheControl,
  mergeRequestConfig,
} from './request-policy';
import { normalizeQueryValue } from './report-query';

type WeeklyReport = ReportsWeeklyResponse;

export async function getWeeklyReport(
  reportId?: string,
  weekPeriod?: string,
  config?: RequestConfig
): Promise<WeeklyReport> {
  try {
    const normalizedReportId = normalizeQueryValue(reportId);
    const normalizedWeekPeriod = normalizeQueryValue(weekPeriod);
    const detailRequestConfig = mergeRequestConfig(config, {
      cancelPrevious: config?.cancelPrevious ?? true,
      requestKey: config?.requestKey || 'weekly-report-detail',
      // 周报详情接口查询链路较长（多表聚合 + 同期口径），给更宽松的超时窗口。
      timeout: config?.timeout ?? 45_000,
      headers: {
        'X-Cache-Control': getBackendCacheControl(CACHE_CONFIG.WEEKLY_REPORT.revalidate),
      },
    });

    if (normalizedWeekPeriod) {
      return await request.get<WeeklyReport>(
        AIOS_API_PATHS.reportWeeklyByPeriod,
        mergeRequestConfig(detailRequestConfig, {
          params: { week_period: normalizedWeekPeriod },
        })
      );
    }

    if (!normalizedReportId) {
      let fallbackWeekPeriod: string | undefined;

      try {
        const allPeriods = await getAllWeeklyPeriods();
        fallbackWeekPeriod = allPeriods[0]?.value;
      } catch {
        // 周期列表不可用时，回退到 latest-period 接口获取最新周期。
        fallbackWeekPeriod = await getLatestWeeklyPeriod();
      }

      if (!fallbackWeekPeriod) {
        throw new APIError('NOT_FOUND', 404, '未找到可用的周周期');
      }

      return await request.get<WeeklyReport>(
        AIOS_API_PATHS.reportWeeklyByPeriod,
        mergeRequestConfig(detailRequestConfig, {
          params: { week_period: fallbackWeekPeriod },
        })
      );
    }

    return await request.get<WeeklyReport>(
      AIOS_API_PATHS.reportWeekly(normalizedReportId),
      mergeRequestConfig(detailRequestConfig, {
        params: { format: 'json' },
        // 此配置仅在服务端有效（fetch 缓存），客户端请求忽略。
      })
    );
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取周报数据失败', error);
  }
}

export async function getLatestWeeklyPeriod(): Promise<string> {
  try {
    const response = await request.get<ReportsWeeklyLatestPeriodResponse>(
      AIOS_API_PATHS.reportWeeklyLatestPeriod,
      {
        timeout: 30_000,
        headers: {
          'X-Cache-Control': getBackendCacheControl(60),
        },
      }
    );
    if (!response?.week_period) {
      throw new APIError('NOT_FOUND', 404, '未找到可用的周周期');
    }
    return response.week_period;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取最新周周期失败', error);
  }
}

export async function getAllWeeklyPeriods(): Promise<Array<{ value: string; label: string }>> {
  try {
    const response = await request.get<ReportsWeeklyPeriodsResponse>(
      AIOS_API_PATHS.reportWeeklyAllPeriods,
      {
        timeout: 30_000,
        params: { limit: 50 },
        headers: {
          'X-Cache-Control': getBackendCacheControl(60),
        },
      }
    );
    if (!response?.periods || !Array.isArray(response.periods)) {
      throw new APIError('INVALID_RESPONSE', 0, '周期数据格式不正确');
    }
    return response.periods;
  } catch (error) {
    if (error instanceof APIError) {
      // all-periods 在后端冷启动或高峰期可能超时/5xx，回退 latest-period 保证页面可用。
      const shouldFallbackToLatest =
        error.code === 'REQUEST_TIMEOUT' ||
        error.code === 'SERVER_ERROR' ||
        error.code === 'SERVICE_UNAVAILABLE' ||
        error.code === 'NETWORK_ERROR' ||
        error.statusCode === 408 ||
        error.statusCode >= 500;

      if (shouldFallbackToLatest) {
        try {
          const latestPeriod = await getLatestWeeklyPeriod();
          return [
            {
              value: latestPeriod,
              label: latestPeriod.replace('~', ' ~ '),
            },
          ];
        } catch {
          // latest 兜底失败时，仍按原错误抛出，避免吞掉真实异常。
        }
      }
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取周期列表失败', error);
  }
}

export async function getWeeklyMetadata(reportId: string): Promise<ReportsWeeklyMetadata> {
  try {
    return await request.get<ReportsWeeklyMetadata>(AIOS_API_PATHS.reportWeeklyMetadata(reportId), {
      headers: {
        'X-Cache-Control': getBackendCacheControl(CACHE_CONFIG.WEEKLY_METADATA.revalidate),
      },
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取周报元数据失败', error);
  }
}

export async function listReports(): Promise<ReportsListResponse> {
  try {
    return await request.get<ReportsListResponse>(AIOS_API_PATHS.reports, {
      headers: {
        'X-Cache-Control': getBackendCacheControl(CACHE_CONFIG.REPORT_LIST.revalidate),
      },
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取报告列表失败', error);
  }
}
