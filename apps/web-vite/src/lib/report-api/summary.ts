import type { WeeklySummaryAIScope } from '@/config/weekly-summary-ai';

import {
  AIOS_API_PATHS,
  type ReportsWeeklySummaryContentResponse,
  type ReportsWeeklySummaryGenerateRequest,
  type ReportsWeeklySummaryGenerateResponse,
  type ReportsWeeklySummaryStatusResponse,
  type ReportsWeeklySummaryUpdateRequest,
} from '../generated-api-contract';
import { APIError, request } from '../request';

import { getLatestWeeklyPeriod } from './weekly';
import {
  normalizeSummaryScopeValue,
  resolveWeeklySummaryQuery,
} from './report-query';
import {
  createApiClientError,
  getRequestErrorCode,
} from './request-policy';
import { getWeeklySummaryAIConfig } from '@/config/weekly-summary-ai';

export interface WeeklySummaryConclusionsInput {
  overall: string;
  highlights: string[];
  risks: string[];
}

export async function generateSummary(
  reportId: string,
  forceRegenerate: boolean = false,
  weekPeriod?: string,
  summaryScope?: WeeklySummaryAIScope
): Promise<ReportsWeeklySummaryGenerateResponse> {
  try {
    const { safeReportId, normalizedWeekPeriod } = resolveWeeklySummaryQuery(
      reportId,
      weekPeriod
    );
    let resolvedWeekPeriod = normalizedWeekPeriod;
    if (!resolvedWeekPeriod && safeReportId === 'latest') {
      resolvedWeekPeriod = await getLatestWeeklyPeriod();
    }
    const payload: ReportsWeeklySummaryGenerateRequest = {
      force_regenerate: forceRegenerate,
    };

    if (resolvedWeekPeriod) {
      payload.week_period = resolvedWeekPeriod;
    }

    const aiConfig = getWeeklySummaryAIConfig(summaryScope);
    const provider = aiConfig.provider?.trim();
    const model = aiConfig.model?.trim();
    const businessFramework = aiConfig.businessFramework?.trim();
    const customPrompt = aiConfig.customPrompt?.trim();
    const factsData = aiConfig.factsData;

    if (provider) {
      payload.provider = provider;
    }

    if (model) {
      payload.model = model;
    }

    if (businessFramework) {
      payload.business_framework = businessFramework;
    }

    if (customPrompt) {
      payload.custom_prompt = customPrompt;
    }

    if (factsData && Object.keys(factsData).length > 0) {
      payload.facts_data = factsData;
    }

    const normalizedSummaryScope = normalizeSummaryScopeValue(summaryScope);
    if (normalizedSummaryScope) {
      payload.summary_scope = normalizedSummaryScope;
    }

    return await request.post<ReportsWeeklySummaryGenerateResponse>(
      AIOS_API_PATHS.reportWeeklyGenerateSummary(safeReportId),
      payload,
      {
        timeout: 30_000,
        retryMode: 'never',
      }
    );
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '触发总结生成失败', error);
  }
}

export async function getSummaryStatus(
  reportId: string,
  weekPeriod?: string,
  summaryScope?: WeeklySummaryAIScope
): Promise<ReportsWeeklySummaryStatusResponse> {
  try {
    const { safeReportId, normalizedWeekPeriod } = resolveWeeklySummaryQuery(
      reportId,
      weekPeriod
    );
    let resolvedWeekPeriod = normalizedWeekPeriod;
    if (!resolvedWeekPeriod && safeReportId === 'latest') {
      resolvedWeekPeriod = await getLatestWeeklyPeriod();
    }
    const normalizedSummaryScope = normalizeSummaryScopeValue(summaryScope);
    const params: Record<string, string> = {};

    if (resolvedWeekPeriod) {
      params.week_period = resolvedWeekPeriod;
    }

    if (normalizedSummaryScope) {
      params.summary_scope = normalizedSummaryScope;
    }

    return await request.get<ReportsWeeklySummaryStatusResponse>(
      AIOS_API_PATHS.reportWeeklySummaryStatus(safeReportId),
      {
        ...(Object.keys(params).length > 0 ? { params } : {}),
        timeout: 45_000,
      }
    );
  } catch (error) {
    if (getRequestErrorCode(error) === 'ERR_CANCELED') {
      throw createApiClientError('REQUEST_CANCELED', '请求已取消', error);
    }
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取总结生成状态失败', error);
  }
}

export async function getSummary(
  reportId: string,
  weekPeriod?: string,
  summaryScope?: WeeklySummaryAIScope
): Promise<ReportsWeeklySummaryContentResponse> {
  try {
    const { safeReportId, normalizedWeekPeriod } = resolveWeeklySummaryQuery(
      reportId,
      weekPeriod
    );
    let resolvedWeekPeriod = normalizedWeekPeriod;
    if (!resolvedWeekPeriod && safeReportId === 'latest') {
      resolvedWeekPeriod = await getLatestWeeklyPeriod();
    }
    const normalizedSummaryScope = normalizeSummaryScopeValue(summaryScope);
    const params: Record<string, string> = {};

    if (resolvedWeekPeriod) {
      params.week_period = resolvedWeekPeriod;
    }

    if (normalizedSummaryScope) {
      params.summary_scope = normalizedSummaryScope;
    }

    return await request.get<ReportsWeeklySummaryContentResponse>(
      AIOS_API_PATHS.reportWeeklySummary(safeReportId),
      {
        ...(Object.keys(params).length > 0 ? { params } : {}),
        timeout: 45_000,
      }
    );
  } catch (error) {
    if (getRequestErrorCode(error) === 'ERR_CANCELED') {
      throw createApiClientError('REQUEST_CANCELED', '请求已取消', error);
    }
    if (error instanceof APIError) {
      throw error;
    }
    throw createApiClientError('UNKNOWN_ERROR', '获取总结内容失败', error);
  }
}

export async function updateSummary(
  reportId: string,
  conclusions: WeeklySummaryConclusionsInput,
  weekPeriod?: string,
  summaryScope?: WeeklySummaryAIScope
): Promise<ReportsWeeklySummaryContentResponse> {
  try {
    const { safeReportId, normalizedWeekPeriod } = resolveWeeklySummaryQuery(
      reportId,
      weekPeriod
    );

    const payload: ReportsWeeklySummaryUpdateRequest = {
      conclusions,
    };

    if (normalizedWeekPeriod) {
      payload.week_period = normalizedWeekPeriod;
    }

    const normalizedSummaryScope = normalizeSummaryScopeValue(summaryScope);
    if (normalizedSummaryScope) {
      payload.summary_scope = normalizedSummaryScope;
    }

    return await request.put<ReportsWeeklySummaryContentResponse>(
      AIOS_API_PATHS.reportWeeklySummary(safeReportId),
      payload,
      { retryMode: 'never' },
    );
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    throw createApiClientError('UNKNOWN_ERROR', '更新总结内容失败', error);
  }
}
