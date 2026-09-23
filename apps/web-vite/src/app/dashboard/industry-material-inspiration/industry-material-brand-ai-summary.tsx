import type {
  BrandAiExecutiveSummary,
} from './industry-material-brand-ai-insight-panel-helpers';
import styles from './industry-material-brand-ai-summary.module.css';

interface BrandAiSummaryProps {
  summary: BrandAiExecutiveSummary;
}

export function BrandAiSummary({ summary }: BrandAiSummaryProps) {
  return (
    <section className={styles.summaryCard} aria-label="品牌 AI 洞察摘要">
      <header className={styles.summaryHeader}>
        <span>AI 洞察摘要</span>
        <h3>{summary.headline}</h3>
        <p>{summary.evidenceLabel}</p>
      </header>

      <div className={styles.summaryGrid}>
        {summary.items.map((item) => (
          <article key={item.key}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
