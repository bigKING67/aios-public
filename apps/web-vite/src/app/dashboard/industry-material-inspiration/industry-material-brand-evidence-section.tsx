import { LinkOutlined } from '@ant-design/icons';
import type {
  IndustryMaterialBrandInsightEvidenceMaterial,
  IndustryMaterialBrandInsightNextAction,
  IndustryMaterialFusionAlignment,
  IndustryMaterialFusionConfidence,
  IndustryMaterialFusionContentEvidenceTier,
  IndustryMaterialFusionContentLevel,
  IndustryMaterialFusionMetricBand,
  IndustryMaterialTab,
} from './industry-material-inspiration-types';
import {
  EMPTY_TEXT,
  formatInteger,
  formatRate,
} from './industry-material-inspiration-formatters';
import {
  evidenceMetricItems,
  resolveAssetHref,
} from './industry-material-brand-ai-insight-panel-helpers';
import styles from './industry-material-brand-evidence-section.module.css';

interface BrandEvidenceSectionProps {
  activeTab: IndustryMaterialTab;
  materials: IndustryMaterialBrandInsightEvidenceMaterial[];
  secondaryActions: IndustryMaterialBrandInsightNextAction[];
  gaps: string[];
}

const ALIGNMENT_LABELS: Record<IndustryMaterialFusionAlignment, string> = {
  reinforced: '内容与表现一致',
  content_leads: '内容信号领先',
  performance_leads: '表现信号领先',
  mixed: '信号分化',
  data_only: '仅数据',
  content_only: '仅内容',
  insufficient: '证据不足',
};

const CONFIDENCE_LABELS: Record<IndustryMaterialFusionConfidence, string> = {
  high: '高置信',
  medium: '中置信',
  low: '低置信',
  insufficient: '置信不足',
};

const METRIC_BAND_LABELS: Record<IndustryMaterialFusionMetricBand, string> = {
  high: '行业高位',
  mid: '行业中位',
  low: '行业低位',
  missing: '缺失',
};

const CONTENT_LEVEL_LABELS: Record<IndustryMaterialFusionContentLevel, string> = {
  strong: '强',
  medium: '中',
  weak: '弱',
  none: '无',
  observed: '已识别',
  unknown: '待识别',
};

const CONTENT_EVIDENCE_LABELS: Record<IndustryMaterialFusionContentEvidenceTier, string> = {
  structured_video_understanding: '结构化视频理解',
  legacy_ai_summary: 'AI 摘要/标签兜底',
  none: '无内容证据',
};

const LIVE_LEAD_DECISION_METRICS = new Set(['3S', '完播', 'CTR']);
const GOODS_DECISION_METRICS = new Set(['CTR', 'CVR', '完播']);

function formatScore(value: number | null): string {
  return value === null ? EMPTY_TEXT : String(Math.round(value));
}

function decisionMetricLabels(tab: IndustryMaterialTab): Set<string> {
  return tab === 'douyin_live_lead_short_video'
    ? LIVE_LEAD_DECISION_METRICS
    : GOODS_DECISION_METRICS;
}

function EvidenceMaterialRow({
  activeTab,
  material,
  index,
}: {
  activeTab: IndustryMaterialTab;
  material: IndustryMaterialBrandInsightEvidenceMaterial;
  index: number;
}) {
  const diagnosis = material.fusionDiagnosis;
  const href = resolveAssetHref(material.assetId);
  const title = material.title || `证据素材 ${index + 1}`;
  const evidenceText = material.summary || material.reason || '暂无 AI 摘要，保留为表现证据。';
  const metricSignals = diagnosis?.metricSignals.filter((signal) => signal.band !== 'missing') ?? [];
  const contentSignals = diagnosis?.contentSignals.filter((signal) => signal.level !== 'unknown') ?? [];
  const allMetrics = evidenceMetricItems(activeTab, material);
  const preferredMetrics = decisionMetricLabels(activeTab);
  const decisionMetrics = allMetrics.filter((metric) => preferredMetrics.has(metric.label)).slice(0, 3);

  return (
    <article className={styles.evidenceRow}>
      <div
        className={`${styles.evidenceOverview} ${
          diagnosis ? '' : styles.evidenceOverviewWithoutScore
        }`}
      >
        {diagnosis ? (
          <div className={styles.scoreBadge} aria-label={`融合分 ${formatScore(diagnosis.score)}`}>
            <strong>{formatScore(diagnosis.score)}</strong>
            <span>融合分</span>
          </div>
        ) : null}

        <div className={styles.titleBlock}>
          <div className={styles.titleLine}>
            <span>#{formatInteger(material.rank ?? index + 1)}</span>
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" title={title}>
                <span className={styles.evidenceTitle}>{title}</span>
                <LinkOutlined className={styles.evidenceTitleIcon} aria-hidden />
              </a>
            ) : (
              <strong title={title}>{title}</strong>
            )}
          </div>
          {diagnosis ? <strong className={styles.diagnosisHeadline}>{diagnosis.headline}</strong> : null}
          <p className={styles.evidenceSummary}>{evidenceText}</p>
        </div>

        <div className={styles.decisionColumn}>
          {diagnosis ? (
            <div className={styles.statusTags} aria-label="融合诊断状态">
              <span>{ALIGNMENT_LABELS[diagnosis.alignment]}</span>
              <span>{CONFIDENCE_LABELS[diagnosis.confidence]}</span>
            </div>
          ) : null}
          <dl className={styles.evidenceMetrics} aria-label="关键决策指标">
            {decisionMetrics.map((metric) => (
              <div key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {diagnosis ? (
        <details className={styles.diagnosisDetails}>
          <summary>
            <span className={styles.diagnosisSummaryClosed}>展开诊断</span>
            <span className={styles.diagnosisSummaryOpen}>收起诊断</span>
          </summary>
          <div className={styles.diagnosisContent}>
            <div className={styles.diagnosisScoreMeta} aria-label="融合分构成">
              <span>指标分 {formatScore(diagnosis.metricScore)}</span>
              <span>内容分 {formatScore(diagnosis.contentScore)}</span>
              <span>{CONTENT_EVIDENCE_LABELS[diagnosis.contentEvidenceTier]}</span>
            </div>
            <div className={styles.fullMetricGroup}>
              <span>完整指标</span>
              <div className={styles.signalTags}>
                {allMetrics.map((metric) => (
                  <span key={metric.label}>{metric.label} {metric.value}</span>
                ))}
              </div>
            </div>
            <div className={styles.signalColumns}>
              <div>
                <span>指标相对位置</span>
                <div className={styles.signalTags}>
                  {metricSignals.length ? (
                    metricSignals.map((signal) => (
                      <span key={signal.key}>
                        {signal.label} {formatRate(signal.value)} · {METRIC_BAND_LABELS[signal.band]}
                      </span>
                    ))
                  ) : (
                    <span>暂无可比较指标</span>
                  )}
                </div>
              </div>
              <div>
                <span>视频内容信号</span>
                <div className={styles.signalTags}>
                  {contentSignals.length ? (
                    contentSignals.map((signal) => (
                      <span key={signal.key} title={signal.value}>
                        {signal.label} · {CONTENT_LEVEL_LABELS[signal.level]}
                      </span>
                    ))
                  ) : (
                    <span>暂无结构化视频理解</span>
                  )}
                </div>
              </div>
            </div>
            <p className={styles.diagnosisText}>{diagnosis.diagnosis}</p>
            <div className={styles.nextStep}>
              <strong>下一步验证</strong>
              <span>{diagnosis.nextStep || '继续观察行业可见指标和视频内容信号。'}</span>
            </div>
          </div>
        </details>
      ) : null}
    </article>
  );
}

export function BrandEvidenceSection({
  activeTab,
  materials,
  secondaryActions,
  gaps,
}: BrandEvidenceSectionProps) {
  const hasSecondaryActions = secondaryActions.length > 0;

  return (
    <section className={styles.evidenceWorkspace} aria-label="品牌证据与验证动作">
      {hasSecondaryActions ? (
        <details className={styles.actionDisclosure}>
          <summary>
            <span>另外 {secondaryActions.length} 项验证动作</span>
            <em>优先动作已进入摘要</em>
          </summary>
          <div className={styles.actionList}>
            {secondaryActions.map((action, index) => (
              <article className={styles.actionRow} key={`${action.title}-${index}`}>
                <span>{action.priority || 'medium'} / {action.owner || 'unknown'}</span>
                <strong>{action.title}</strong>
                <p>{action.detail || action.metricTarget || '基于当前品牌素材覆盖继续观察。'}</p>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      <section className={styles.evidenceSection} aria-label="高表现证据素材">
        <header className={styles.sectionHeader}>
          <div>
            <h3>高表现证据素材</h3>
          </div>
          <span>{materials.length ? `Top ${materials.length}` : '暂无'}</span>
        </header>
        <div className={styles.evidenceList}>
          {materials.length ? (
            materials.map((material, index) => (
              <EvidenceMaterialRow
                activeTab={activeTab}
                material={material}
                index={index}
                key={`${material.assetId ?? material.title}-${index}`}
              />
            ))
          ) : (
            <p className={styles.emptyText}>暂无可展示的证据素材。</p>
          )}
        </div>
      </section>

      {gaps.length ? (
        <div className={styles.gapBox} role="status">
          <strong>覆盖缺口</strong>
          <ul>
            {gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
