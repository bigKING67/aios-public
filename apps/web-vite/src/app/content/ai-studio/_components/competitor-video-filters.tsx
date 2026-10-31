import { Select, Tooltip } from '@lobehub/ui';
import { Info } from 'lucide-react';
import type { StudioOverviewPeriod } from '../_lib/ai-studio-api';
import type { CompetitorSource } from '../_lib/competitor-api';
import type { PeriodSelection } from '../_lib/studio-period';
import { StudioPeriodControl } from './studio-period-control';
import styles from './competitor.module.css';

export function CompetitorVideoFilters({ source, selection, period, onSource, onSelection }: {
  source: CompetitorSource; selection: PeriodSelection; period: StudioOverviewPeriod | undefined;
  onSource: (source: CompetitorSource) => void; onSelection: (selection: PeriodSelection) => void;
}) {
  return <div className={styles.catalogFilters} role="search" aria-label="竞品视频筛选">
    <div className={styles.sourceSelect}>
      <label htmlFor="competitor-source" className="sr-only">视频来源</label>
      <Select id="competitor-source" value={source} onChange={(value) => {
        if (value === 'all' || value === 'compass' || value === 'manual') onSource(value);
      }} options={[{ value: 'all', label: '全部来源' }, { value: 'compass', label: '罗盘榜单' }, { value: 'manual', label: '手动添加' }]} />
    <Tooltip title="罗盘按榜单日期，手动按首次手动收录日期；全部来源取两者并集，同一视频只计一次。已退榜且没有手动来源的历史视频，仅在全部来源中按首次收录日期保留。上榜天数和排名按所选时段统计。">
      <Info size={14} tabIndex={0} aria-label="日期与来源口径" className={styles.catalogInfo} />
    </Tooltip>
    </div>
    <StudioPeriodControl selection={selection} period={period} onChange={onSelection} />

  </div>;
}
