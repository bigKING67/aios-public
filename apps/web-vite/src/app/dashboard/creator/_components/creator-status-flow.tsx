'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { CreatorCooperationStageRows } from './creator-cooperation-stages';
import { formatInteger, formatRate } from './creator-formatters';
import styles from './creator-status.module.css';

export interface CreatorStatusFlowProps<TKey extends string, TRow> {
  stages: readonly CreatorCooperationStageRows<TKey, TRow>[];
  totalCount: number;
  selectedStageKey: TKey | null;
  onSelectedStageChange: Dispatch<SetStateAction<TKey | null>>;
  ariaLabel?: string;
}

interface CreatorStatusFlowNodeProps<TKey extends string, TRow> {
  stage: CreatorCooperationStageRows<TKey, TRow>;
  totalCount: number;
  isActive: boolean;
  onToggle: (stageKey: TKey) => void;
}

function resolveStatusFlowNodeClassName(isActive: boolean) {
  return isActive ? `${styles.statusFlowNode} ${styles.statusFlowNodeActive}` : styles.statusFlowNode;
}

function CreatorStatusFlowNode<TKey extends string, TRow>({
  stage,
  totalCount,
  isActive,
  onToggle,
}: CreatorStatusFlowNodeProps<TKey, TRow>) {
  const stageCount = stage.rows.length;
  const stageRatio = totalCount > 0 ? stageCount / totalCount : 0;
  const formattedStageCount = `${formatInteger(stageCount)} 人`;
  const formattedStageRatio = formatRate(stageRatio, 1);

  return (
    <button
      type="button"
      className={resolveStatusFlowNodeClassName(isActive)}
      data-stage={stage.key}
      aria-pressed={isActive}
      aria-label={`${stage.label}，${formattedStageCount}，占比 ${formattedStageRatio}${isActive ? '，当前已筛选' : '，点击筛选'}`}
      onClick={() => onToggle(stage.key)}
    >
      <div className={styles.statusFlowNodeTop}>
        <span>{stage.label}</span>
        <em>{formattedStageRatio}</em>
      </div>
      <strong>{formattedStageCount}</strong>
    </button>
  );
}

export function CreatorStatusFlow<TKey extends string, TRow>({
  stages,
  totalCount,
  selectedStageKey,
  onSelectedStageChange,
  ariaLabel = '合作状态序列',
}: CreatorStatusFlowProps<TKey, TRow>) {
  const handleStageToggle = (stageKey: TKey) => {
    onSelectedStageChange((current) => (current === stageKey ? null : stageKey));
  };

  return (
    <div className={styles.statusFlowScroller}>
      <div className={styles.statusFlowGrid} role="list" aria-label={ariaLabel}>
        {stages.map((stage, index) => {
          const isActive = selectedStageKey === stage.key;

          return (
            <div key={stage.key} className={styles.statusFlowItem} role="listitem">
              <CreatorStatusFlowNode
                stage={stage}
                totalCount={totalCount}
                isActive={isActive}
                onToggle={handleStageToggle}
              />
              {index < stages.length - 1 ? (
                <span className={styles.statusFlowArrow} aria-hidden="true">
                  →
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
