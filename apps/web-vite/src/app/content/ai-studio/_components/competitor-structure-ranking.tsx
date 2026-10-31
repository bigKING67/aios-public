import { Button, Empty, Segmented } from '@lobehub/ui';
import { Surface } from '@lobehub/ui/dashboard';
import { Fragment, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import {
  formatOwnLane,
  formatOwnShare,
  formatSales,
  formatShare,
  isSmallSample,
  MARK_NAMES,
  type OwnStructures,
  type PatternPayload,
  type PatternStructures,
  SMALL_SAMPLE_FILMS,
  type StructureComparisonRow,
  structureComparison,
  type StructureLane,
  type StructureSort,
} from '../_lib/competitor-patterns';
import { formatShortTimestamp } from '../_lib/studio-time';
import { ExampleList, Track } from './competitor-pattern-sections';
import { labelToneClass } from './label-tones';
import patternStyles from './competitor-patterns.module.css';
import styles from './competitor-overview.module.css';

/**
 * 框架结构排行: one lane at a time (框架 / 卖点), each structure on one row with the competitor share
 * on the left and our side on the right, so a difference reads at a glance. Competitor numbers are the
 * snapshot's films (a re-posted material counts each time) with the brands behind them; our side is the
 * 视频云管家 spend of our originals in the chosen dates (D16), or their count when none has spend data. A
 * competitor row opens its films.
 */

const LANE_OPTIONS: { label: string; value: StructureLane }[] = [
  { label: '框架结构', value: 'framework' },
  { label: '卖点结构', value: 'sellingPoint' },
];
const JOINERS: Record<StructureLane, string> = { framework: '→', sellingPoint: '+' };
const VISIBLE_ROWS = 10;

const SORT_OPTIONS: { label: string; value: StructureSort }[] = [
  { label: '按视频条数', value: 'families' },
  { label: '按直播间销售额', value: 'sales' },
];

export function CompetitorStructureRanking({
  payload,
  own,
  computedAt,
  analyzing,
  sort: requested,
  lane,
  onSortChange,
  onLaneChange,
}: {
  payload: PatternPayload;
  /** Our side; null from an API without it. */
  own: OwnStructures | null;
  computedAt: string | null;
  /** Films being analysed across every category. */
  analyzing: number;
  sort: StructureSort;
  lane: StructureLane;
  onSortChange: (sort: StructureSort) => void;
  onLaneChange: (lane: StructureLane) => void;
}) {
  const structures = payload.structures;
  const salesReadable = structures?.sales.available ?? false;
  const sort = salesReadable ? requested : 'families';
  return (
    <Surface
      title="框架结构排行"
      extra={
        // The switch alone: with the meta beside it a phone-width heading pushed the title out.
        <span role="group" aria-label="排序">
          <Segmented<StructureSort>
            size="small"
            value={sort}
            options={SORT_OPTIONS.map((option) => ({ ...option, disabled: option.value === 'sales' && !salesReadable }))}
            onChange={onSortChange}
          />
        </span>
      }
    >
      {structures ? (
        <div className={styles.body}>
          <p className={patternStyles.caption}>
            {sortNote(payload, structures, sort, salesReadable)}
            {computedAt ? `统计于 ${formatShortTimestamp(computedAt)}` : ''}
            {analyzing ? ` · 全部品类拆解中 ${analyzing} 条` : ''}
          </p>
          <div className={styles.laneRow}>
            <span role="group" aria-label="结构">
              <Segmented<StructureLane> value={lane} options={LANE_OPTIONS} onChange={onLaneChange} />
            </span>
            <OwnNote own={own} lane={lane} />
          </div>
          <h3 className={patternStyles.subhead}>完整结构</h3>
          <ComparisonList key={`${lane}:${sort}`} payload={payload} structures={structures} own={own} lane={lane} sort={sort} />
        </div>
      ) : (
        <Empty description="框架结构统计还在更新，通常一分钟内完成。" />
      )}
    </Surface>
  );
}

function sortNote(payload: PatternPayload, structures: PatternStructures, sort: StructureSort, salesReadable: boolean): string {
  if (sort === 'sales') {
    return (
      `关联直播间销售额：视频引流到的直播间在这段时间的成交（罗盘区间合计，按下限排序，同一直播间同一天只算一次），` +
      `不是视频本身带来的成交。${structures.sales.films}/${structures.films} 条视频有罗盘数据。`
    );
  }
  const notes = ['竞品按视频条数计（同一素材每投放一次算一条），后面是这些视频来自几个品牌。'];
  if (isSmallSample(payload)) notes.push(`样本少：不足 ${SMALL_SAMPLE_FILMS} 条，只显示“几条中有几条”。`);
  if (!salesReadable) notes.push('罗盘榜单暂时读不到，不能按销售额排序。');
  return notes.join('');
}

function OwnNote({ own, lane }: { own: OwnStructures | null; lane: StructureLane }) {
  if (own && own[lane].assets > 0) {
    const { days, synced } = own.spendDays;
    if (days === null || synced >= days) return null;
    return (
      <p className={patternStyles.caption}>
        {synced ? `我方消耗只同步了这段时间中的 ${synced}/${days} 天，按已同步的天数加总。` : '这段时间还没有同步我方消耗，我方按原片条数对照。'}
      </p>
    );
  }
  return (
    <p className={patternStyles.caption}>
      {own
        ? `我方还没有已确认${lane === 'framework' ? '框架' : '卖点'}片段的原片，暂时无法对照。`
        : '我方数据将在视频云管家接入后，按这段时间的消耗统计。'}
      {own ? (
        <>
          {' '}
          <RouterLink
            className={styles.inlineLink}
            to={lane === 'framework' ? ROUTE_PATHS.contentAiStudioSegments : ROUTE_PATHS.contentAiStudioSellingPoints}
          >
            去{lane === 'framework' ? '框架片段' : '卖点片段'}确认
          </RouterLink>
        </>
      ) : null}
    </p>
  );
}

function laneNote(structures: PatternStructures, lane: StructureLane): string {
  const notes = [`${structures[lane].films} 条`];
  if (structures.missing) notes.push(`${structures.missing} 条没有框架拆解`);
  if (lane === 'sellingPoint' && structures[lane].empty) notes.push(`${structures[lane].empty} 条没识别到卖点`);
  return notes.join(' · ');
}

function share(value: { numerator: number; denominator: number } | null): number | null {
  return value ? (value.denominator ? value.numerator / value.denominator : 0) : null;
}

/** The 竞品 and 我方 cells of a comparison row: a bar (when there is a value) and its figure. */
function Sides({
  comp,
  compText,
  ours,
  oursText,
}: {
  comp: { numerator: number; denominator: number } | null;
  compText: string;
  ours: { numerator: number; denominator: number } | null;
  oursText: string;
}) {
  const compValue = share(comp);
  const oursValue = share(ours);
  return (
    <>
      <span className={styles.compareSide} data-side="comp">
        <span className={styles.sideLabel}>竞品</span>
        {compValue === null ? <span /> : <Track value={compValue} />}
        <span className={patternStyles.share}>{compText}</span>
      </span>
      <span className={styles.compareSide} data-side="ours">
        <span className={styles.sideLabel}>我方</span>
        {oursValue === null ? <span /> : <Track value={oursValue} ours />}
        <span className={patternStyles.share}>{oursText}</span>
      </span>
    </>
  );
}

function ComparisonList({
  payload,
  structures,
  own,
  lane,
  sort,
}: {
  payload: PatternPayload;
  structures: PatternStructures;
  own: OwnStructures | null;
  lane: StructureLane;
  sort: StructureSort;
}) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const rows = structureComparison(payload, own, lane, sort);
  const shown = all ? rows : rows.slice(0, VISIBLE_ROWS);
  const salesOf = new Map(structures[lane].rows.map((row) => [row.key, row.sales]));
  const order = structures.labelOrder[lane];
  const compValue = (row: StructureComparisonRow) => {
    if (!row.comp) return '—';
    const sales = salesOf.get(row.comp.key);
    if (sort === 'sales' && sales) return formatSales(sales);
    return row.comp.brands ? `${formatShare(row.comp)} · ${row.comp.brands} 个品牌` : formatShare(row.comp);
  };
  if (rows.length === 0) {
    return <p className={patternStyles.caption}>{sort === 'sales' ? '这段时间没有关联到罗盘销售额' : '还没有可统计的结构'}</p>;
  }
  return (
    <>
      <div className={styles.compareHead} aria-hidden>
        <span>结构</span>
        <span>竞品 · {laneNote(structures, lane)}</span>
        <span>我方 · {own?.[lane].assets ? formatOwnLane(own[lane]) : '暂无'}</span>
      </div>
      <ul className={styles.compareList} aria-label={LANE_OPTIONS.find((option) => option.value === lane)?.label}>
        {shown.map((row) => {
          const examples = row.comp?.examples ?? [];
          const expanded = open === row.key;
          const compText = compValue(row);
          const oursText = row.ours && sort === 'families' ? formatOwnShare(row.ours) : '—';
          const content = (
            <>
              <span className={styles.compareName}>
                <span className={styles.structure}>
                  {row.labels.map((key, index) => (
                    <Fragment key={`${key}:${index}`}>
                      {index ? (
                        <span className={styles.joiner} aria-hidden>
                          {JOINERS[lane]}
                        </span>
                      ) : null}
                      <span className={styles.step}>
                        <span className={`${styles.stepDot} ${labelToneClass(order, key) ?? ''}`} aria-hidden />
                        {structures.labels[lane][key] ?? own?.[lane].labels[key] ?? key}
                      </span>
                    </Fragment>
                  ))}
                </span>
                {row.mark ? <span className={styles.gap}>{MARK_NAMES[row.mark]}</span> : null}
              </span>
              <Sides comp={row.comp} compText={compText} ours={sort === 'families' ? row.ours : null} oursText={oursText} />
            </>
          );
          const accessible = `${row.name}：竞品 ${compText}，我方 ${oursText}${row.mark ? `，${MARK_NAMES[row.mark]}` : ''}`;
          return (
            <li key={row.key}>
              {examples.length ? (
                <button
                  type="button"
                  className={styles.compareRow}
                  aria-expanded={expanded}
                  aria-label={`${accessible}，查看代表视频`}
                  onClick={() => setOpen(expanded ? null : row.key)}
                >
                  {content}
                </button>
              ) : (
                <div className={`${styles.compareRow} ${styles.compareStatic}`} aria-label={accessible}>
                  {content}
                </div>
              )}
              {expanded ? <ExampleList examples={examples} flush /> : null}
            </li>
          );
        })}
      </ul>
      {rows.length > VISIBLE_ROWS ? (
        <Button type="text" size="small" className={styles.more} onClick={() => setAll(!all)}>
          {all ? '收起' : `展开全部 ${rows.length} 种`}
        </Button>
      ) : null}
    </>
  );
}
