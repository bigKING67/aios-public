import type {
  IndustryMaterialBrandContentThemeGroup,
  IndustryMaterialBrandContentThemeSummary,
  IndustryMaterialBrandContentThemeTerm,
} from './industry-material-inspiration-types';
import { formatInteger } from './industry-material-inspiration-formatters';
import styles from './industry-material-brand-content-theme-map.module.css';

interface BrandContentThemeMapProps {
  summary: IndustryMaterialBrandContentThemeSummary;
  terms: IndustryMaterialBrandContentThemeTerm[];
}

const GROUP_LABELS: Record<IndustryMaterialBrandContentThemeGroup, string> = {
  topic: '内容主题｜视频在讲什么',
  expression: '表达方式｜视频怎么讲',
};

function scoreClassName(score: number): string {
  if (score >= 70) {
    return styles.themeTermLarge;
  }
  if (score >= 50) {
    return styles.themeTermMedium;
  }
  return styles.themeTermSmall;
}

function performanceClassName(term: IndustryMaterialBrandContentThemeTerm): string {
  if (term.performanceBand === 'high') {
    return styles.themeTermHigh;
  }
  if (term.performanceBand === 'mid') {
    return styles.themeTermMid;
  }
  return styles.themeTermLow;
}

function scoreLabel(score: number): string {
  return score.toFixed(1);
}

function ThemeGroup({
  group,
  terms,
}: {
  group: IndustryMaterialBrandContentThemeGroup;
  terms: IndustryMaterialBrandContentThemeTerm[];
}) {
  return (
    <section className={styles.themeGroup} aria-label={GROUP_LABELS[group]}>
      <header className={styles.themeGroupHeader}>
        <h4>{GROUP_LABELS[group]}</h4>
        <span>{formatInteger(terms.length)} 个</span>
      </header>
      <ul className={styles.themeTerms}>
        {terms.map((term) => {
          const detail = `${term.term}，综合强度 ${scoreLabel(term.themeScore)}，行业相对表现 ${scoreLabel(term.performanceScore)}，证据素材 ${formatInteger(term.sourceCount)} 条`;
          return (
            <li
              className={`${styles.themeTerm} ${scoreClassName(term.themeScore)} ${performanceClassName(term)}`}
              key={`${group}-${term.term}`}
              title={detail}
              aria-label={detail}
            >
              <strong>{term.term}</strong>
              <span>{formatInteger(term.sourceCount)} 条</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BrandContentThemeMap({ summary, terms }: BrandContentThemeMapProps) {
  const topicTerms = terms.filter((term) => term.group === 'topic');
  const expressionTerms = terms.filter((term) => term.group === 'expression');
  const groups = [
    { group: 'topic' as const, terms: topicTerms },
    { group: 'expression' as const, terms: expressionTerms },
  ].filter((item) => item.terms.length > 0);

  return (
    <section className={styles.themeMap} aria-label="高表现内容主题图">
      <header className={styles.themeMapHeader}>
        <div>
          <span>内容理解 × 行业表现</span>
          <h3>高表现内容主题</h3>
          <p>
            基于 {formatInteger(summary.eligibleMaterials)} 条同时具备视频理解与行业可见表现的素材，组内按综合强度排序
          </p>
        </div>
        <div className={styles.themeLegend} aria-label="主题图图例">
          <span>
            <i className={styles.legendSize} aria-hidden />字号 = 综合主题强度
          </span>
          <span>
            <i className={styles.legendColor} aria-hidden />蓝色深浅 = 行业相对表现支撑
          </span>
        </div>
      </header>

      {groups.length > 0 ? (
        <div
          className={`${styles.themeGroups} ${groups.length === 1 ? styles.themeGroupsSingle : ''}`}
        >
          {groups.map((item) => (
            <ThemeGroup group={item.group} terms={item.terms} key={item.group} />
          ))}
        </div>
      ) : (
        <div className={styles.themeEmpty}>
          <strong>暂无足够的内容 × 表现主题证据</strong>
          <span>至少需要 2 条同时具备结构化视频理解和行业可见指标的素材。</span>
        </div>
      )}

      <details className={styles.themeMethodDetails}>
        <summary>查看主题强度口径</summary>
        <p>综合强度 = 内容重要性 45% + 素材覆盖 20% + 行业相对表现 35%</p>
      </details>
    </section>
  );
}
