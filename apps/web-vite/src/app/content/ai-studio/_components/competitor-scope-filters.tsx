import { Select } from '@lobehub/ui';
import type { ReactNode } from 'react';
import type { StudioOverviewPeriod } from '../_lib/ai-studio-api';
import type { CardLabels } from '../_lib/competitor-card';
import { competitorCategoryName, scopeCategoryKeys } from '../_lib/competitor-scope';
import type { PeriodSelection } from '../_lib/studio-period';
import { StudioPeriodControl } from './studio-period-control';
import styles from './competitor-patterns.module.css';

const CATEGORY_SELECT_ID = 'competitor-scope-category';

/** Category, then the same 日 / 月 / 年 / 自定义 period as the studio home (by the date a film was first seen). */
export function CompetitorScopeFilters({
  category,
  selection,
  period,
  categories,
  labels,
  onCategoryChange,
  onSelectionChange,
  children,
}: {
  category: string;
  selection: PeriodSelection;
  /** The period the server resolved; may still be the previous selection's while loading. */
  period: StudioOverviewPeriod | undefined;
  categories: ReadonlyArray<{ key: string; films: number }>;
  labels: CardLabels | null;
  onCategoryChange: (category: string) => void;
  onSelectionChange: (selection: PeriodSelection) => void;
  /** Further page-specific controls, after category and period. */
  children?: ReactNode;
}) {
  const films = new Map(categories.map((item) => [item.key, item.films]));
  return (
    <div className={styles.filters} role="search" aria-label="统计范围">
      {/* lobe Select does not forward aria-label: a visually hidden label carries it. */}
      <div className={styles.category}>
        <label className="sr-only" htmlFor={CATEGORY_SELECT_ID}>
          品类
        </label>
        <Select
          id={CATEGORY_SELECT_ID}
          value={category}
          onChange={(value) => typeof value === 'string' && onCategoryChange(value)}
          options={scopeCategoryKeys(category, categories).map((key) => ({
            value: key,
            label: `${competitorCategoryName(key, labels)}${films.has(key) ? `（${films.get(key)}）` : ''}`,
          }))}
        />
      </div>
      <StudioPeriodControl selection={selection} period={period} onChange={onSelectionChange} />
      {children}
    </div>
  );
}
