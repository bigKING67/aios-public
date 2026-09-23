'use client';

import { Button } from 'antd';
import { formatTokenPreview } from './dataops-hub-formatters';
import notificationTableStyles from './dataops-notification-table.module.css';
import pipelineStyles from './dataops-pipeline-table.module.css';

interface DataOpsNotificationLinkIndexProps {
  reasonHash: string;
  retryGroupId: string;
  variant?: 'expanded' | 'compact';
  onApplyReasonHashFilter: (reasonHash: string) => void;
  onApplyRetryGroupFilter: (retryGroupId: string) => void;
  onOpenRetryGroupTrace: (retryGroupId: string) => void;
  onCopy: (text: string, label: string) => Promise<void>;
}

export function DataOpsNotificationLinkIndex({
  reasonHash,
  retryGroupId,
  variant = 'expanded',
  onApplyReasonHashFilter,
  onApplyRetryGroupFilter,
  onOpenRetryGroupTrace,
  onCopy,
}: DataOpsNotificationLinkIndexProps) {
  if (variant === 'compact') {
    return (
      <>
        {reasonHash ? (
          <div className="flex flex-wrap gap-2">
            <span className={pipelineStyles.inlineCode}>{formatTokenPreview(reasonHash, 16)}</span>
            <Button
              type="link"
              size="small"
              onClick={() => onApplyReasonHashFilter(reasonHash)}
            >
              按 reasonHash 筛选
            </Button>
          </div>
        ) : null}
        {retryGroupId ? (
          <div className="flex flex-wrap gap-2">
            <span className={pipelineStyles.inlineCode}>{formatTokenPreview(retryGroupId, 16)}</span>
            <Button
              type="link"
              size="small"
              onClick={() => onOpenRetryGroupTrace(retryGroupId)}
            >
              查看链路
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section className={pipelineStyles.pipelineExpandSection}>
      <h4>链路索引</h4>
      <div className={pipelineStyles.pipelineKvList}>
        <div className={pipelineStyles.pipelineKvItem}>
          <span className={pipelineStyles.pipelineKvLabel}>reasonHash</span>
          {reasonHash ? (
            <div className={notificationTableStyles.notificationCodeRow}>
              <span className={pipelineStyles.inlineCode}>{formatTokenPreview(reasonHash, 20)}</span>
              <div className={notificationTableStyles.notificationCodeActions}>
                <Button
                  type="link"
                  size="small"
                  onClick={() => onApplyReasonHashFilter(reasonHash)}
                >
                  筛选
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    void onCopy(reasonHash, 'reasonHash');
                  }}
                >
                  复制
                </Button>
              </div>
            </div>
          ) : (
            <span className={pipelineStyles.pipelineKvValue}>-</span>
          )}
        </div>

        <div className={pipelineStyles.pipelineKvItem}>
          <span className={pipelineStyles.pipelineKvLabel}>retryGroupId</span>
          {retryGroupId ? (
            <div className={notificationTableStyles.notificationCodeRow}>
              <span className={pipelineStyles.inlineCode}>{formatTokenPreview(retryGroupId, 20)}</span>
              <div className={notificationTableStyles.notificationCodeActions}>
                <Button
                  type="link"
                  size="small"
                  onClick={() => onApplyRetryGroupFilter(retryGroupId)}
                >
                  筛选
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => onOpenRetryGroupTrace(retryGroupId)}
                >
                  链路
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    void onCopy(retryGroupId, 'retryGroupId');
                  }}
                >
                  复制
                </Button>
              </div>
            </div>
          ) : (
            <span className={pipelineStyles.pipelineKvValue}>-</span>
          )}
        </div>
      </div>
    </section>
  );
}
