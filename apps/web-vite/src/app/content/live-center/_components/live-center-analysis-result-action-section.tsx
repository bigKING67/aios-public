import { Empty } from 'antd';
import { Badge } from '@/components/atoms/badge';
import { formatInteger, resolveStatusBadge } from '../_lib/live-center-formatters';
import type { LiveCenterAnalysisReviewTaskItem } from '../_lib/live-center-view-helpers';
import sectionStyles from '../live-center-analysis-review-sections.module.css';
import resultStyles from '../live-center-analysis-result.module.css';
import {
  formatReviewPriorityLabel,
} from './live-center-analysis-result-formatters';
import {
  ResultSection,
} from './live-center-analysis-result-utils';

export function ActionBacklogSection({
  expanded,
  items,
  onToggleExpanded,
  pinnedActionTitle,
  totalCount,
  visibleLimit,
}: {
  expanded: boolean;
  items: LiveCenterAnalysisReviewTaskItem[];
  onToggleExpanded: () => void;
  pinnedActionTitle?: string | null;
  totalCount: number;
  visibleLimit: number;
}) {
  return (
    <ResultSection
      title="行动优先级"
      visibleCount={items.length}
      totalCount={totalCount}
      visibleLimit={visibleLimit}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    >
      {items.length > 0 ? (
        <ol className={sectionStyles.actionBacklogList}>
          {pinnedActionTitle ? (
            <li className={sectionStyles.actionBacklogPinnedNote}>
              首屏已置顶“{pinnedActionTitle}”，以下只列剩余动作。
            </li>
          ) : null}
          {items.map((task, index) => (
            <li key={`${task.title}-${index}`}>
              <article className={sectionStyles.actionBacklogRow}>
                <div className={sectionStyles.actionBacklogPriority}>
                  <span>{formatReviewPriorityLabel(task.priority) || `P${formatInteger(Math.min(index + 1, 3))}`}</span>
                </div>
                <div className={sectionStyles.actionBacklogBody}>
                  <div className={resultStyles.analysisResultRowTitle}>
                    <strong>{task.title}</strong>
                    {task.status ? <Badge status={resolveStatusBadge(task.status)}>{task.status}</Badge> : null}
                  </div>
                  <p>{task.detail}</p>
                  <div className={resultStyles.analysisResultTaskMeta}>
                    {task.owner ? <span>负责人 {task.owner}</span> : null}
                    {task.due ? <span>截止 {task.due}</span> : null}
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <Empty
          className={resultStyles.analysisResultEmpty}
          description={pinnedActionTitle
            ? `首屏已置顶“${pinnedActionTitle}”；当前没有更多动作/复核项。`
            : '本次没有形成可执行动作清单；页面不补写未经验证的建议。'}
        />
      )}
    </ResultSection>
  );
}
