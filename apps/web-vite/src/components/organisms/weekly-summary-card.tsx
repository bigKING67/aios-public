'use client';

import React from 'react';
import { Card } from 'antd';
import {
  useGenerateSummaryMutation,
  useUpdateSummaryMutation,
  useWeeklySummary,
} from '@/hooks/use-weekly-summary';
import { usePermission } from '@/hooks/use-permission';
import {
  REPORT_SUMMARY_CONFIG_PERMISSIONS,
  REPORT_SUMMARY_EDIT_PERMISSIONS,
  REPORT_SUMMARY_GENERATE_PERMISSIONS,
} from '@/lib/report-permissions';
import { WeeklySummaryCardActionBar } from './weekly-summary-card-action-bar';
import { WeeklySummaryCardContent } from './weekly-summary-card-content';
import { useWeeklySummaryCardConfigState } from './weekly-summary-card-config-state';
import { useWeeklySummaryCardEditState } from './weekly-summary-card-edit-state';
import { WeeklySummaryConfigModal } from './weekly-summary-config-modal';
import { WeeklySummaryEditModal } from './weekly-summary-edit-modal';
import {
  CONTENT_STATUS_META,
} from './weekly-summary-card-model';
import type { WeeklySummaryCardProps } from './weekly-summary-card-types';
import styles from './weekly-summary-card-modern.module.css';

export type { WeeklySummaryCardProps } from './weekly-summary-card-types';

export const WeeklySummaryCard: React.FC<WeeklySummaryCardProps> = ({
  reportId,
  weekPeriod,
  summaryLabel = '本周总结',
  summaryScope = 'global',
}) => {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useWeeklySummary(reportId, weekPeriod, summaryScope);
  const {
    mutate: generateSummary,
    isPending: isGeneratingMutation,
  } = useGenerateSummaryMutation(reportId, weekPeriod, summaryScope);
  const {
    mutate: updateSummary,
    isPending: isUpdatingSummary,
  } = useUpdateSummaryMutation(reportId, weekPeriod, summaryScope);

  const canConfigureSummary = usePermission(REPORT_SUMMARY_CONFIG_PERMISSIONS, 'any');
  const canEditSummary = usePermission(REPORT_SUMMARY_EDIT_PERMISSIONS, 'any');
  const canGenerateSummary = usePermission(REPORT_SUMMARY_GENERATE_PERMISSIONS, 'any');

  const status = data?.status || 'NONE';
  const isInProgress = status === 'GENERATING' || status === 'PENDING';
  const isGenerating = isInProgress || isGeneratingMutation;
  const isBusy = isGenerating || isUpdatingSummary;
  const hasData = status === 'SUCCESS' && !!data?.conclusions;
  const contentStatus = data?.content_status;
  const contentStatusMeta = contentStatus
    ? CONTENT_STATUS_META[contentStatus]
    : CONTENT_STATUS_META.AI_DRAFT;
  const statusTagLabel = status === 'NONE' ? '未生成' : contentStatusMeta.label;
  const statusTagColor = status === 'NONE' ? 'default' : contentStatusMeta.color;
  const errorMessage =
    (error as Error | undefined)?.message || '请稍后重试，或刷新页面后重试。';

  const { openConfigModal, configModalProps } = useWeeklySummaryCardConfigState({
    summaryScope,
    confirmLoading: isBusy,
  });
  const { openEditModal, editModalProps } = useWeeklySummaryCardEditState({
    data,
    updateSummary,
    confirmLoading: isUpdatingSummary,
  });

  const handleGenerateSummary = (forceRegenerate: boolean) => {
    generateSummary({ forceRegenerate });
  };

  const handleRefetchSummary = () => {
    void refetch();
  };

  return (
    <>
      <Card
        className={`weekly-summary-card ${styles.cardRoot}`}
        title={summaryLabel}
        extra={
          <WeeklySummaryCardActionBar
            statusTagLabel={statusTagLabel}
            statusTagColor={statusTagColor}
            generatedAt={data?.generated_at}
            provider={data?.provider}
            model={data?.model}
            updatedBy={data?.updated_by}
            canConfigureSummary={canConfigureSummary}
            canEditSummary={canEditSummary}
            canGenerateSummary={canGenerateSummary}
            isBusy={isBusy}
            isGenerating={isGenerating}
            hasData={hasData}
            summaryLabel={summaryLabel}
            onOpenConfig={openConfigModal}
            onOpenEdit={openEditModal}
            onGenerateSummary={handleGenerateSummary}
          />
        }
      >
        <WeeklySummaryCardContent
          data={data}
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          status={status}
          summaryLabel={summaryLabel}
          canGenerateSummary={canGenerateSummary}
          isBusy={isBusy}
          isGeneratingMutation={isGeneratingMutation}
          onRefetch={handleRefetchSummary}
          onGenerateSummary={handleGenerateSummary}
        />
      </Card>

      <WeeklySummaryConfigModal {...configModalProps} />

      <WeeklySummaryEditModal {...editModalProps} />
    </>
  );
};
