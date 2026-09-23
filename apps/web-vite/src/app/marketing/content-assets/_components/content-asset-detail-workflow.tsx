import type { ContentAssetDetailResponse } from '../_lib/content-assets-types';
import { formatDateTime } from '../_lib/content-assets-formatters';
import type { WorkflowState } from './content-asset-detail-workbench-state';
import pageStyles from './content-assets-inspector-page.module.css';

export interface ContentAssetDetailWorkflowItem {
  label: string;
  value: string;
  state: WorkflowState;
}

export function ContentAssetWorkflowPanel({ items }: { items: ContentAssetDetailWorkflowItem[] }) {
  return (
    <section className={pageStyles.workflowPanel} aria-label="素材工作流状态">
      {items.map((item) => (
        <article className={workflowItemClassName(item.state)} key={item.label}>
          <span className={pageStyles.workflowIcon} aria-hidden="true" />
          <div>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        </article>
      ))}
    </section>
  );
}

export function ContentAssetContextPanel({ detail }: { detail: ContentAssetDetailResponse }) {
  const asset = detail.asset;
  return (
    <section className={pageStyles.contextPanel} aria-label="素材上下文">
      <div>
        <span>入库时间</span>
        <strong>{formatDateTime(asset.uploadedAt || asset.createdAt)}</strong>
      </div>
      <div>
        <span>分析模型</span>
        <strong>{asset.aiAnalysisModel || '--'}</strong>
      </div>
      <div>
        <span>脚本模型</span>
        <strong>{asset.transcriptModel || detail.transcript?.model || '--'}</strong>
      </div>
    </section>
  );
}

function workflowItemClassName(state: WorkflowState): string {
  return [
    pageStyles.workflowItem,
    state === 'ready' ? pageStyles.workflowItemReady : '',
    state === 'partial' ? pageStyles.workflowItemPartial : '',
    state === 'blocked' ? pageStyles.workflowItemBlocked : '',
  ].filter(Boolean).join(' ');
}
