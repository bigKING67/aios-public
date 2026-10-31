'use client';

import { Button, Tag } from '@lobehub/ui';
import { Pencil, Settings } from 'lucide-react';
import dayjs from 'dayjs';
import { AiActionButton } from '@/components/molecules/ai-action-button';
import styles from './weekly-summary-card-modern.module.css';

export interface WeeklySummaryCardActionBarProps {
  statusTagLabel: string;
  statusTagColor: string;
  generatedAt: string | undefined;
  provider: string | undefined;
  model: string | undefined;
  updatedBy: string | undefined;
  canConfigureSummary: boolean;
  canEditSummary: boolean;
  canGenerateSummary: boolean;
  isBusy: boolean;
  isGenerating: boolean;
  hasData: boolean;
  summaryLabel: string;
  onOpenConfig: () => void;
  onOpenEdit: () => void;
  onGenerateSummary: (forceRegenerate: boolean) => void;
}

export function WeeklySummaryCardActionBar({
  statusTagLabel,
  statusTagColor,
  generatedAt,
  provider,
  model,
  updatedBy,
  canConfigureSummary,
  canEditSummary,
  canGenerateSummary,
  isBusy,
  isGenerating,
  hasData,
  summaryLabel,
  onOpenConfig,
  onOpenEdit,
  onGenerateSummary,
}: WeeklySummaryCardActionBarProps) {
  return (
    <div className={`weekly-summary-extra ${styles.actionBar}`}>
      <Tag
        color={statusTagColor === 'default' ? undefined : statusTagColor}
        className={styles.statusTag}
      >
        {statusTagLabel}
      </Tag>
      {generatedAt && (
        <span className={styles.generatedAt}>
          最后生成: {dayjs(generatedAt).format('MM-DD HH:mm')}
        </span>
      )}
      {(provider || model) && (
        <span className={styles.generatedAt}>
          模型: {provider || '--'} / {model || '--'}
        </span>
      )}
      {updatedBy && (
        <span className={styles.generatedAt}>编辑人: {updatedBy}</span>
      )}
      <div className={styles.actionButtons}>
        {canConfigureSummary && (
          <Button
            icon={<Settings size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={onOpenConfig}
            disabled={isBusy}
          >
            AI配置
          </Button>
        )}
        {canEditSummary && (
          <Button
            icon={<Pencil size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={onOpenEdit}
            disabled={!hasData || isBusy}
          >
            编辑总结
          </Button>
        )}
        <AiActionButton
          loading={isGenerating}
          onClick={() => onGenerateSummary(hasData)}
          disabled={isBusy || !canGenerateSummary}
        >
          {isGenerating ? '生成中...' : hasData ? '重新生成' : `生成${summaryLabel}`}
        </AiActionButton>
      </div>
    </div>
  );
}
