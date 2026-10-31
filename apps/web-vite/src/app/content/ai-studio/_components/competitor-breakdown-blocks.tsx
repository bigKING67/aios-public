import { useState, type ReactNode } from 'react';
import { Button } from '@lobehub/ui';
import type { useOpeningFormulas } from '../_lib/use-opening-formulas';
import {
  BREAKDOWN_TOP,
  type Breakdown,
  ENDORSER_ROLE_NAMES,
  formatFilmShare,
  scenePointName,
  type TopFilm,
} from '../_lib/competitor-breakdown';
import { type PatternPayload } from '../_lib/competitor-patterns';
import type { ReportReading, ReportView } from '../_lib/competitor-report';
import { CompetitorTopFilmsDrawer, type TopFilmsTarget } from './competitor-top-films-drawer';
import styles from './competitor-breakdown.module.css';

/** Semantic formulas have their own state; scene/endorser statistics and optional readings remain independent. */
export function CompetitorBreakdownBlocks({
  breakdown,
  payload,
  report,
  openings,
}: {
  breakdown: Breakdown;
  payload: PatternPayload;
  /** A succeeded report for the current statistics; null shows the snapshot alone. */
  report: ReportView | null;
  openings: ReturnType<typeof useOpeningFormulas>;
}) {
  const [target, setTarget] = useState<TopFilmsTarget | null>(null);
  const films = breakdown.films;
  const open = (title: string, row: { films: number; brands: number }, top: TopFilm[]) =>
    setTarget({ title, figure: formatFilmShare(row, films), films: top });
  const formulas = openings.report?.formulaStatus === 'ok' ? openings.report.formulas : [];
  const extracting = breakdown.enriched < films;

  return (
    <div className={styles.blocks}>
      <p className={styles.blockNote}>
        x/{films} 条：所选时间的 {films} 条竞品视频里有几条这样做，同一素材每投放一次算一条；后面是这些视频来自几个品牌，品牌多说明是行业通用做法。点击开头公式查看全部来源视频；场景和背书展示关联直播间销售额前 5 条。
      </p>

      <Block
        title="开头 3 秒怎么说"
        note="按核心语义和表达逻辑归纳，措辞不同也可以归为同一公式"
      >
        {formulas.slice(0, BREAKDOWN_TOP).map((formula) => (
          <Row
            key={formula.id}
            label={`公式 ${formula.template}`}
            figure={formatFilmShare(formula, films)}
            actionLabel="查看全部来源视频和开头文案"
            onOpen={() => setTarget({ title: formula.template, figure: formatFilmShare(formula, films), films: formula.sources, sourceCount: formula.films })}
          >
            <span className={styles.rowName}>{formula.template}</span>
          </Row>
        ))}
        {openings.pending ? <Empty>正在归纳开头公式，完成后自动显示。</Empty> : openings.message ? (
          <Empty>{openings.message} {openings.retry ? <Button size="small" onClick={openings.retry}>重试公式归纳</Button> : null}</Empty>
        ) : !openings.report ? (
          <Empty>{breakdown.hook.films ? '开头公式尚未生成。' : '这段时间的视频都没有可归纳的开头口播或字幕。'}</Empty>
        ) : null}
        {openings.report?.unassignedFilms ? (
          <Row label="尚未归类的开头" figure={`${openings.report.unassignedFilms} 条`} actionLabel="查看来源文案"
            onOpen={() => setTarget({ title: '尚未归类的开头', figure: `${openings.report!.unassignedFilms} 条`, films: openings.report!.unassignedSources, sourceCount: openings.report!.unassignedFilms, unassigned: true })}>
            <span className={styles.rowDetail}>这些开头暂未确定共同含义，保留原文供核对。</span>
          </Row>
        ) : null}
        {openings.report && !formulas.length && !openings.report.unassignedFilms ? <Empty>这段时间没有可归纳的开头口播或字幕。</Empty> : null}
        {formulas.length > BREAKDOWN_TOP ? <Empty>显示使用条数最多的 {BREAKDOWN_TOP} 个公式，共 {formulas.length} 个。</Empty> : null}
      </Block>

      <Block
        title="在什么场景解决什么痛点"
        note={extracting ? `已提取 ${breakdown.enriched}/${films} 条` : '场景是时机或情境，不是拍摄地点'}
        readings={report?.sceneReadings}
      >
        {breakdown.scene.rows.slice(0, BREAKDOWN_TOP).map((row) => {
          const point = scenePointName(row);
          return (
            <Row
              key={row.key}
              label={`${row.scene}，${row.pain}，${point}`}
              figure={formatFilmShare(row, films)}
              onOpen={() => open(`${row.scene} · ${row.pain}`, row, row.top)}
            >
              <span className={`${styles.rowName} ${styles.chain}`}>
                <span>{row.scene}</span>
                <span className={styles.arrow} aria-hidden>→</span>
                <span>{row.pain}</span>
                <span className={styles.arrow} aria-hidden>→</span>
                <span className={styles.point}>{point}</span>
              </span>
              {row.audiences.length ? (
                <span className={styles.tags}>
                  {row.audiences.map((audience) => (
                    <span key={audience} className={styles.tag}>{audience}</span>
                  ))}
                </span>
              ) : null}
              {row.text ? <span className={styles.rowDetail}>“{row.text}”</span> : null}
            </Row>
          );
        })}
        {breakdown.scene.rows.length === 0 ? (
          <Empty>{breakdown.enriched ? '已提取的视频里没有讲到场景和痛点。' : '场景和痛点还在提取，完成后自动显示。'}</Empty>
        ) : null}
      </Block>

      <Block
        title="谁在背书"
        note={extracting ? `已提取 ${breakdown.enriched}/${films} 条` : '只记视频里写出或说出的名字'}
        readings={report?.endorserReadings}
      >
        {breakdown.endorser.rows.slice(0, BREAKDOWN_TOP).map((row) => (
          <Row
            key={row.key}
            label={`${row.name}，${ENDORSER_ROLE_NAMES[row.role]}`}
            figure={formatFilmShare(row, films)}
            onOpen={() => open(`${row.name}（${ENDORSER_ROLE_NAMES[row.role]}）`, row, row.top)}
          >
            <span className={styles.rowName}>
              {row.name}
              <span className={styles.rowDetail}>（{ENDORSER_ROLE_NAMES[row.role]}）</span>
            </span>
          </Row>
        ))}
        {Object.entries(breakdown.endorser.unnamed).map(([role, value]) => (
          <Row key={`unnamed:${role}`} label={`未具名${ENDORSER_ROLE_NAMES[role as keyof typeof ENDORSER_ROLE_NAMES]}`} figure={formatFilmShare(value, films)}>
            <span className={styles.rowDetail}>未具名{ENDORSER_ROLE_NAMES[role as keyof typeof ENDORSER_ROLE_NAMES]}（视频里没写出名字）</span>
          </Row>
        ))}
        {breakdown.endorser.other.films ? (
          <Row label="其他背书" figure={formatFilmShare(breakdown.endorser.other, films)}>
            <span className={styles.rowDetail}>其他背书：用户口碑、销量热度、检测报告等，没有人名</span>
          </Row>
        ) : null}
        {breakdown.endorser.rows.length === 0 && !breakdown.endorser.other.films && !Object.keys(breakdown.endorser.unnamed).length ? (
          <Empty>{breakdown.enriched ? '已提取的视频里没有背书人。' : '背书人还在提取，完成后自动显示。'}</Empty>
        ) : null}
      </Block>

      <CompetitorTopFilmsDrawer
        target={target}
        payload={payload}
        salesAvailable={breakdown.salesAvailable}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}

function Block({ title, note, readings, children }: { title: string; note: string; readings?: ReportReading[]; children: ReactNode }) {
  return (
    <section className={styles.block} aria-label={title}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>{title}</h3>
        <span className={styles.blockNote}>{note}</span>
      </div>
      <ul className={styles.rows}>{children}</ul>
      {readings?.length ? (
        <ul className={styles.readings} aria-label={`${title} · AI 解读`}>
          {readings.map((reading, index) => (
            <li key={index} className={styles.reading}>
              {reading.statement}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Row({ label, figure, onOpen, children, actionLabel = '查看销售额前 5 的视频' }: { label: string; figure: string; onOpen?: () => void; children: ReactNode; actionLabel?: string }) {
  const content = (
    <>
      <span className={styles.rowMain}>{children}</span>
      <span className={styles.figure}>{figure}</span>
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button type="button" className={styles.row} aria-label={`${label}：${figure}，${actionLabel}`} onClick={onOpen}>
          {content}
        </button>
      ) : (
        <div className={`${styles.row} ${styles.rowStatic}`} aria-label={`${label}：${figure}`}>
          {content}
        </div>
      )}
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <li>
      <p className={styles.rowDetail}>{children}</p>
    </li>
  );
}
