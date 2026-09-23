import type {
  IndustryMaterialBrandInsightBoundary,
  IndustryMaterialBrandInsightAnalysisProfile,
} from './industry-material-inspiration-types';
import styles from './industry-material-analysis-profile-card.module.css';

interface AnalysisProfileCardProps {
  profile: IndustryMaterialBrandInsightAnalysisProfile;
  boundary: IndustryMaterialBrandInsightBoundary;
}

export function AnalysisProfileCard({ profile, boundary }: AnalysisProfileCardProps) {
  return (
    <details className={styles.analysisProfileCard} aria-label="分析口径">
      <summary className={styles.analysisProfileSummary}>
        <span>分析口径</span>
        <strong>行业可见指标 × 视频理解</strong>
        <span>{boundary.conclusionPolicy}</span>
      </summary>

      <div className={styles.analysisProfileContent}>
        <div className={styles.analysisProfileHeader}>
          <strong>{profile.title}</strong>
          <p>{profile.primaryQuestion}</p>
          <p>{profile.decisionLens}</p>
        </div>

        <div className={styles.analysisProfileGrid}>
          <div className={styles.analysisProfileColumn}>
            <span>指标判读顺序</span>
            <ol className={styles.metricPriorityList}>
              {profile.metricPriority.map((metric) => (
                <li key={metric.key}>
                  <strong>{metric.label}</strong>
                  <span>{metric.role}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className={styles.analysisProfileColumn}>
            <span>视频内容焦点</span>
            <div className={styles.analysisProfileTags}>
              {profile.videoContentFocus.map((focus) => (
                <span key={focus}>{focus}</span>
              ))}
            </div>
          </div>
          <div className={styles.analysisProfileColumn}>
            <span>不可判断项</span>
            <div className={styles.analysisProfileTags}>
              {profile.forbiddenConclusions.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
