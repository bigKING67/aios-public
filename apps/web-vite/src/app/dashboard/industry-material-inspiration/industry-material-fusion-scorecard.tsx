import type {
  IndustryMaterialFusionSummary,
} from './industry-material-inspiration-types';
import {
  EMPTY_TEXT,
  formatInteger,
} from './industry-material-inspiration-formatters';
import styles from './industry-material-fusion-scorecard.module.css';

interface FusionScorecardProps {
  brandLabel: string;
  summary: IndustryMaterialFusionSummary | null;
}

function formatBenchmarkDescription(
  brandLabel: string,
  summary: IndustryMaterialFusionSummary
): string {
  if (summary.scoredMaterials === null || summary.benchmarkSampleSize === null) {
    return `${brandLabel} 的素材按${summary.benchmarkLabel}进行相对评分。`;
  }

  return `${brandLabel} 的 ${formatInteger(summary.scoredMaterials)} 条素材，以当前月份同视频类型的 ${formatInteger(summary.benchmarkSampleSize)} 条行业素材作为相对评分基准。`;
}

export function FusionScorecard({ brandLabel, summary }: FusionScorecardProps) {
  const averageScore =
    summary?.averageScore === null || summary?.averageScore === undefined
      ? EMPTY_TEXT
      : String(Math.round(summary.averageScore));

  return (
    <section className={styles.fusionSnapshot} aria-label="融合证据快照">
      <header className={styles.fusionHeader}>
        <div>
          <span>融合证据快照</span>
          <h3>内容判断有多少证据支撑</h3>
        </div>
        <div
          className={styles.primaryScore}
          aria-label={`平均融合分 ${averageScore}，满分 100`}
        >
          <div className={styles.scoreValue}>
            <strong>{averageScore}</strong>
            <span>/ 100</span>
          </div>
          <span>平均融合分</span>
        </div>
      </header>

      {summary ? (
        <>
          <p className={styles.scoreMeaning}>{summary.methodNote}</p>
          <div className={styles.supportMetrics} aria-label={`${brandLabel} 融合证据覆盖`}>
            <div>
              <strong>
                {formatInteger(summary.structuredVideoMaterials)} / {formatInteger(summary.scoredMaterials)}
              </strong>
              <span>视频理解覆盖</span>
            </div>
            <div>
              <strong>{formatInteger(summary.highConfidenceMaterials)}</strong>
              <span>高置信素材</span>
            </div>
            <div>
              <strong>{formatInteger(summary.benchmarkSampleSize)}</strong>
              <span>行业对标样本</span>
            </div>
          </div>
          <details className={styles.methodDetails}>
            <summary>查看评分口径</summary>
            <p>{formatBenchmarkDescription(brandLabel, summary)}</p>
            <p>
              数据与内容同时可评分 {formatInteger(summary.dataContentFusionMaterials)} 条。
            </p>
          </details>
        </>
      ) : (
        <div className={styles.fusionEmpty}>
          <strong>融合评分暂不可用</strong>
          <span>保留已有内容判断和原始证据，不为旧响应补造分数。</span>
        </div>
      )}
    </section>
  );
}
