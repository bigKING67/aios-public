import { Button } from 'antd';
import pipelineStyles from './dataops-pipeline-table.module.css';

interface DataOpsPipelineFilterContextProps {
  statusFilterLabel: string;
  keywordFilterText: string;
  matchedPipelineCount: number;
  hasPipelineFilter: boolean;
  onClearFilters: () => void;
}

export function DataOpsPipelineFilterContext({
  statusFilterLabel,
  keywordFilterText,
  matchedPipelineCount,
  hasPipelineFilter,
  onClearFilters,
}: DataOpsPipelineFilterContextProps) {
  return (
    <div className={pipelineStyles.filterContextBar}>
      <div className={pipelineStyles.filterContextSummary}>
        <span className={pipelineStyles.filterContextLabel}>筛选摘要</span>
        <span className={pipelineStyles.filterContextText}>
          状态 {statusFilterLabel} · 关键字 {keywordFilterText} · 匹配 {matchedPipelineCount}{' '}
          个任务
        </span>
      </div>
      {hasPipelineFilter ? (
        <Button
          size="small"
          type="link"
          className={pipelineStyles.filterResetButton}
          onClick={onClearFilters}
        >
          清空筛选
        </Button>
      ) : null}
    </div>
  );
}
