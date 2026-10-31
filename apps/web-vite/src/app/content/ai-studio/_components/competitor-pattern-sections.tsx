import { Tooltip } from '@lobehub/ui';
import { type ReactNode, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  examplesOf,
  formatShare,
  type PatternBar,
  type PatternExample,
  type PatternPayload,
  type PatternTextLabel,
  competitorAnalysisHref,
} from '../_lib/competitor-patterns';
import styles from './competitor-patterns.module.css';

function analysisHref(example: PatternExample): string | null {
  return example.analysisId ? competitorAnalysisHref(example.analysisId) : null;
}

export function ExampleList({ examples, flush = false }: { examples: PatternExample[]; flush?: boolean }) {
  return (
    <ul className={`${styles.examples} ${flush ? styles.examplesFlush : ''}`}>
      {examples.map((example) => {
        const href = analysisHref(example);
        return <li key={example.awemeId}>{href ? <RouterLink to={href}>{example.title}</RouterLink> : example.title}</li>;
      })}
    </ul>
  );
}

/** `ours`: our side of a 竞品 / 我方 comparison, in the second chart series. */
export function Track({ value, ours = false }: { value: number; ours?: boolean }) {
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  return (
    <span className={styles.track} aria-hidden>
      <span className={`${styles.fill} ${ours ? styles.fillOurs : ''}`} style={{ width }} />
    </span>
  );
}

/** Share bars; a row with films opens them (up to five, each to its analysis). */
export function PatternBars({
  bars,
  empty = '没有可统计的视频',
  format = formatShare,
  wideNames = false,
  renderName,
}: {
  bars: PatternBar[];
  empty?: string;
  format?: (bar: PatternBar) => string;
  /** Long labels (opening paths) get a wider name column. */
  wideNames?: boolean;
  /** A richer name (structures in label tones) that wraps instead of truncating and takes most of the row;
   * `name` stays the accessible text. */
  renderName?: (bar: PatternBar) => ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (bars.length === 0) return <p className={styles.caption}>{empty}</p>;
  return (
    <ul className={`${styles.bars} ${wideNames ? styles.barsWide : ''} ${renderName ? styles.barsRich : ''}`}>
      {bars.map((bar) => {
        const expanded = open === bar.key;
        const content = (
          <>
            {renderName ? (
              <span className={styles.barNameWrap}>{renderName(bar)}</span>
            ) : (
              <span className={styles.barName} title={bar.name}>
                {bar.name}
              </span>
            )}
            <Track value={bar.denominator ? bar.numerator / bar.denominator : 0} />
            <span className={styles.share}>{format(bar)}</span>
          </>
        );
        const label = bar.examples.length ? (
          <button
            type="button"
            className={styles.barButton}
            aria-expanded={expanded}
            aria-label={`${bar.name}：${format(bar)}，查看代表视频`}
            onClick={() => setOpen(expanded ? null : bar.key)}
          >
            {content}
          </button>
        ) : (
          <div className={`${styles.barButton} ${styles.barStatic}`}>{content}</div>
        );
        return (
          <li key={bar.key}>
            {bar.detail && bar.detail !== bar.name ? <Tooltip title={bar.detail}>{label}</Tooltip> : label}
            {expanded ? <ExampleList examples={bar.examples} flush={!!renderName} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TextChips({ title, part, payload }: { title: string; part: { denominator: number; labels: PatternTextLabel[] }; payload: PatternPayload }) {
  const [open, setOpen] = useState<string | null>(null);
  const selected = part.labels.find((label) => label.text === open);
  return (
    <>
      <h3 className={styles.subhead}>
        {title}（{part.denominator} 条可评估视频）
      </h3>
      {part.labels.length === 0 ? (
        <p className={styles.caption}>还没有</p>
      ) : (
        <ul className={styles.chips}>
          {part.labels.map((label) => (
            <li key={label.text}>
              <button
                type="button"
                className={styles.chipButton}
                aria-expanded={open === label.text}
                onClick={() => setOpen(open === label.text ? null : label.text)}
              >
                {label.text}
                <span className={styles.tabular}>×{label.films}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? <ExampleList examples={examplesOf(payload, selected.exampleFilms)} flush /> : null}
    </>
  );
}
