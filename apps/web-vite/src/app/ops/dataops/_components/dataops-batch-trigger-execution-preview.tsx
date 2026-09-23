'use client';

import batchResultStyles from './dataops-batch-result.module.css';

export interface DataOpsBatchTriggerExecutionPreviewItem {
  id: string;
  name: string;
  parameters: Record<string, string | number | boolean>;
}

interface DataOpsBatchTriggerExecutionPreviewProps {
  items: DataOpsBatchTriggerExecutionPreviewItem[];
}

export function DataOpsBatchTriggerExecutionPreview({
  items,
}: DataOpsBatchTriggerExecutionPreviewProps) {
  return (
    <div className={batchResultStyles.batchPreviewPanel}>
      <div className={batchResultStyles.batchPreviewHead}>
        <h4>执行预览</h4>
        <span>共 {items.length} 个任务</span>
      </div>
      <div className={batchResultStyles.batchPreviewList}>
        {items.map((item) => (
          <article key={`preview-${item.id}`} className={batchResultStyles.batchPreviewItem}>
            <strong>{item.name}</strong>
            <pre className={batchResultStyles.batchPreviewCode}>
              {JSON.stringify(item.parameters, null, 2)}
            </pre>
          </article>
        ))}
      </div>
    </div>
  );
}
