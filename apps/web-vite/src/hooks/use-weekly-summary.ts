'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import reportApi from '@/lib/api';
import type { WeeklySummaryAIScope } from '@/config/weekly-summary-ai';
import {
  buildEmptySummaryByScope,
  buildWeeklySummaryQueryKey,
  isSummaryScopeMatched,
  mapSummaryMeta,
  normalizeGeneratedAt,
  normalizeResponseSummaryScope,
  normalizeSummaryStatus,
  resolveRequestedSummaryScope,
  type APIErrorLike,
  type GenerateSummaryResponse,
  type GenerateSummaryVariables,
  type MutationContext,
  type SummaryContentResponse,
  type SummaryData,
  type SummaryStatusResponse,
  type UpdateSummaryVariables,
} from './weekly-summary-model';

export type { SummaryContentStatus, SummaryData } from './weekly-summary-model';

export const useWeeklySummary = (
  reportId: string,
  weekPeriod?: string,
  summaryScope?: WeeklySummaryAIScope
) => {
  const requestedScope = resolveRequestedSummaryScope(summaryScope);
  const summaryQueryKey = buildWeeklySummaryQueryKey(reportId, weekPeriod, summaryScope);

  return useQuery<SummaryData>({
    queryKey: summaryQueryKey,
    queryFn: async () => {
      let statusData: SummaryStatusResponse;
      try {
        statusData = await reportApi.getSummaryStatus(
          reportId,
          weekPeriod,
          summaryScope
        ) as SummaryStatusResponse;
      } catch (error) {
        const typedError = error as APIErrorLike;
        if (typedError.code === 'REQUEST_CANCELED') {
          return buildEmptySummaryByScope(requestedScope);
        }
        throw error;
      }
      const statusScope = normalizeResponseSummaryScope(statusData?.summary_scope);
      if (!isSummaryScopeMatched(requestedScope, statusScope)) {
        return buildEmptySummaryByScope(requestedScope);
      }
      const status = normalizeSummaryStatus(statusData?.status);

      let conclusions: SummaryData['conclusions'] | undefined;
      let summaryProvider: string | undefined;
      let summaryModel: string | undefined;
      let summaryGeneratedAt = normalizeGeneratedAt(statusData?.generated_at);
      let summaryMeta: Pick<
        SummaryData,
        | 'summary_scope'
        | 'content_status'
        | 'updated_by'
        | 'approved_by'
        | 'approved_at'
        | 'published_by'
        | 'published_at'
      > = mapSummaryMeta(statusData);

      if (status === 'SUCCESS') {
        try {
          const summaryData = await reportApi.getSummary(
            reportId,
            weekPeriod,
            summaryScope
          ) as SummaryContentResponse;
          const contentScope = normalizeResponseSummaryScope(summaryData?.summary_scope);
          if (!isSummaryScopeMatched(requestedScope, contentScope)) {
            return buildEmptySummaryByScope(requestedScope);
          }
          conclusions = summaryData?.conclusions;

          if (typeof summaryData?.provider === 'string' && summaryData.provider) {
            summaryProvider = summaryData.provider;
          }
          if (typeof summaryData?.model === 'string' && summaryData.model) {
            summaryModel = summaryData.model;
          }
          const generatedAtFromSummary = normalizeGeneratedAt(summaryData?.generated_at);
          if (generatedAtFromSummary) {
            summaryGeneratedAt = generatedAtFromSummary;
          }
          summaryMeta = {
            ...summaryMeta,
            ...mapSummaryMeta(summaryData),
          };
        } catch (error) {
          const typedError = error as APIErrorLike;
          if (typedError.code !== 'NOT_FOUND' && typedError.code !== 'REQUEST_CANCELED') {
            throw error;
          }
        }
      }

      if (!summaryProvider && typeof statusData?.provider === 'string' && statusData.provider) {
        summaryProvider = statusData.provider;
      }

      if (!summaryModel && typeof statusData?.model === 'string' && statusData.model) {
        summaryModel = statusData.model;
      }

      return {
        status,
        ...summaryMeta,
        generated_at: summaryGeneratedAt,
        provider: summaryProvider,
        model: summaryModel,
        error_message:
          typeof statusData?.error_msg === 'string'
            ? statusData.error_msg
            : undefined,
        conclusions,
      };
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'GENERATING' || status === 'PENDING' ? 3000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
};

export const useGenerateSummaryMutation = (
  reportId: string,
  weekPeriod?: string,
  summaryScope?: WeeklySummaryAIScope
) => {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const summaryQueryKey = buildWeeklySummaryQueryKey(reportId, weekPeriod, summaryScope);

  return useMutation<GenerateSummaryResponse, APIErrorLike, GenerateSummaryVariables | undefined, MutationContext>({
    mutationFn: async (variables) => {
      return await reportApi.generateSummary(
        reportId,
        Boolean(variables?.forceRegenerate),
        weekPeriod,
        summaryScope
      ) as GenerateSummaryResponse;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: summaryQueryKey });
      const previousData = queryClient.getQueryData<SummaryData>(summaryQueryKey);

      queryClient.setQueryData<SummaryData>(summaryQueryKey, (old) => ({
        ...(old || { status: 'PENDING' as SummaryData['status'] }),
        status: 'GENERATING',
        content_status: 'AI_DRAFT',
        approved_by: undefined,
        approved_at: undefined,
        published_by: undefined,
        published_at: undefined,
        error_message: undefined,
      }));

      return { previousData };
    },
    onError: (error, _variables, context) => {
      const errorMessage =
        error.message || '触发周报总结生成失败，请重试';

      notification.error({
        title: '生成失败',
        description: errorMessage,
      });

      queryClient.setQueryData<SummaryData>(
        summaryQueryKey,
        context?.previousData || {
          status: 'FAILED',
          error_message: errorMessage,
        }
      );
    },
    onSuccess: (payload) => {
      const queued = Boolean(payload?.queued);
      const description = typeof payload?.message === 'string' && payload.message
        ? payload.message
        : queued
          ? '正在调用 AI 分析本周数据，请稍候...'
          : '总结任务状态已更新。';

      notification[queued ? 'success' : 'info']({
        title: queued ? '已开始生成' : '任务未入队',
        description,
      });
      void queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    },
  });
};

export const useUpdateSummaryMutation = (
  reportId: string,
  weekPeriod?: string,
  summaryScope?: WeeklySummaryAIScope
) => {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const summaryQueryKey = buildWeeklySummaryQueryKey(reportId, weekPeriod, summaryScope);

  return useMutation<SummaryContentResponse, APIErrorLike, UpdateSummaryVariables>({
    mutationFn: async (variables) => {
      return await reportApi.updateSummary(
        reportId,
        variables.conclusions,
        weekPeriod,
        summaryScope
      ) as SummaryContentResponse;
    },
    onSuccess: (payload) => {
      queryClient.setQueryData<SummaryData>(summaryQueryKey, (old) => ({
        ...(old || { status: 'SUCCESS' as SummaryData['status'] }),
        status: 'SUCCESS',
        ...mapSummaryMeta(payload),
        conclusions: payload?.conclusions || old?.conclusions,
        generated_at: normalizeGeneratedAt(payload?.generated_at) || old?.generated_at,
        provider:
          typeof payload?.provider === 'string' && payload.provider
            ? payload.provider
            : old?.provider,
        model:
          typeof payload?.model === 'string' && payload.model
            ? payload.model
            : old?.model,
        error_message: undefined,
      }));

      notification.success({
        title: '保存成功',
        description: '总结内容已更新并生效。',
      });

      void queryClient.invalidateQueries({ queryKey: summaryQueryKey });
    },
    onError: (error) => {
      notification.error({
        title: '保存失败',
        description: error.message || '总结保存失败，请稍后重试。',
      });
    },
  });
};
