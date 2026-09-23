import type { CSSProperties } from 'react';
import styles from './creator-library-metric-strip.module.css';
import type { CreatorLibrarySummary } from '../_lib/creator-library-types';

interface CreatorLibraryMetricStripProps {
  summary: CreatorLibrarySummary;
  loading?: boolean;
}

const METRIC_ITEMS = [
  {
    key: 'totalCreators',
    label: '总达人数量',
    note: '达人库沉淀总量',
  },
  {
    key: 'cooperableCreators',
    label: '可合作达人',
    note: '当前可继续推进',
  },
  {
    key: 'negotiatingCreators',
    label: '洽谈中达人',
    note: '建联 / 寄样 / 推进',
  },
  {
    key: 'unfollowed30dCreators',
    label: '30天未跟进',
    note: '需要重新触达',
  },
  {
    key: 'sLevelCreators',
    label: 'S级达人',
    note: '高优先级合作池',
  },
] as const;

export function CreatorLibraryMetricStrip({
  summary,
  loading,
}: CreatorLibraryMetricStripProps) {
  return (
    <section className={styles.metricStrip} aria-label="达人库关键指标">
      {METRIC_ITEMS.map((item, index) => (
        <article
          key={item.key}
          className={styles.metricItem}
          style={{ '--enter-index': index } as CSSProperties}
        >
          <p className={styles.metricLabel}>{item.label}</p>
          <strong className={styles.metricValue}>
            {loading ? '--' : summary[item.key].toLocaleString('zh-CN')}
          </strong>
          <span className={styles.metricNote}>{item.note}</span>
        </article>
      ))}
    </section>
  );
}
