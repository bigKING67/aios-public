'use client';

import type { SummaryData } from '@/hooks/use-weekly-summary';
import {
  formatNumberedActionsForDisplay,
  formatNumericText,
  renderTextWithInlineBold,
  splitOverallSummaryToPoints,
} from './weekly-summary-card-text-rendering';
import {
  WeeklySummaryEmptyContent,
  WeeklySummaryErrorContent,
  WeeklySummaryFailedContent,
  WeeklySummaryGeneratingContent,
  WeeklySummaryLoadingContent,
  WeeklySummaryPendingContent,
} from './weekly-summary-card-status-content';
import styles from './weekly-summary-card-modern.module.css';

export interface WeeklySummaryCardContentProps {
  data: SummaryData | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  status: SummaryData['status'];
  summaryLabel: string;
  canGenerateSummary: boolean;
  isBusy: boolean;
  isGeneratingMutation: boolean;
  onRefetch: () => void;
  onGenerateSummary: (forceRegenerate: boolean) => void;
}

export function WeeklySummaryCardContent({
  data,
  isLoading,
  isError,
  errorMessage,
  status,
  summaryLabel,
  canGenerateSummary,
  isBusy,
  isGeneratingMutation,
  onRefetch,
  onGenerateSummary,
}: WeeklySummaryCardContentProps) {
  if (isLoading) {
    return <WeeklySummaryLoadingContent />;
  }

  if (isError) {
    return <WeeklySummaryErrorContent errorMessage={errorMessage} onRefetch={onRefetch} />;
  }

  if (status === 'FAILED') {
    return (
      <WeeklySummaryFailedContent
        data={data}
        canGenerateSummary={canGenerateSummary}
        isBusy={isBusy}
        onGenerateSummary={onGenerateSummary}
      />
    );
  }

  if (status === 'PENDING') {
    return <WeeklySummaryPendingContent />;
  }

  if (status === 'GENERATING' || isGeneratingMutation) {
    return <WeeklySummaryGeneratingContent />;
  }

  if (status === 'NONE') {
    return (
      <WeeklySummaryEmptyContent
        summaryLabel={summaryLabel}
        canGenerateSummary={canGenerateSummary}
      />
    );
  }

  const conclusions = data?.conclusions;
  const overallPoints = splitOverallSummaryToPoints(conclusions?.overall || '');
  const formattedHighlights = (conclusions?.highlights || [])
    .map((item) => formatNumericText(item))
    .filter((item) => item.trim().length > 0);
  const formattedRisks = (conclusions?.risks || [])
    .map((item) => formatNumericText(item))
    .filter((item) => item.trim().length > 0);
  const hasSummaryDetails = formattedHighlights.length > 0 || formattedRisks.length > 0;

  return (
    <div className={styles.contentStack}>
      <section className={styles.infoSection}>
        <header className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Overview</span>
          <h3 className={styles.sectionTitle}>总体概况</h3>
        </header>
        {overallPoints.length > 0 ? (
          <ul className={`${styles.sectionList} ${styles.overviewList}`}>
            {overallPoints.map((item, idx) => (
              <li key={idx} className={styles.sectionListItem}>
                {renderTextWithInlineBold(formatNumberedActionsForDisplay(item))}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.sectionParagraph}>暂无总体概况。</p>
        )}
      </section>

      {hasSummaryDetails && (
        <div className={styles.dualSectionGrid}>
          {formattedHighlights.length > 0 && (
            <section className={styles.infoSection}>
              <header className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>Highlights</span>
                <h3 className={styles.sectionTitle}>业务亮点</h3>
              </header>
              <ul className={styles.sectionList}>
                {formattedHighlights.map((item, idx) => (
                  <li key={idx} className={styles.sectionListItem}>
                    {renderTextWithInlineBold(formatNumberedActionsForDisplay(item))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {formattedRisks.length > 0 && (
            <section className={styles.infoSection}>
              <header className={styles.sectionHeader}>
                <span className={`${styles.sectionLabel} ${styles.riskLabel}`}>Risks</span>
                <h3 className={styles.sectionTitle}>潜在风险</h3>
              </header>
              <ul className={styles.sectionList}>
                {formattedRisks.map((item, idx) => (
                  <li key={idx} className={`${styles.sectionListItem} ${styles.riskItem}`}>
                    {renderTextWithInlineBold(formatNumberedActionsForDisplay(item))}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
