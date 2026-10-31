import { Image, PreviewGroup } from '@lobehub/ui';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  type CardFramework,
  type EvidenceMedia,
  type TranscriptLine,
  formatClock,
  linesWithin,
  packRows,
  sellingPointCounts,
} from '../_lib/competitor-card';
import { timelinePercent, timelineTicks } from '../_lib/segment-time';
import { CompetitorOriginalPlayer } from './competitor-original-player';
import { type Tone, TONE_CLASSES, toneOf } from './label-tones';
import { TimelineRuler } from './timeline-ruler';
import { useTimelineHover } from './use-timeline-hover';
import styles from './competitor-structure.module.css';
import timeline from './segment-timeline.module.css';

/**
 * A competitor film in our own preset labels: 框架结构 as a timeline (框架 and 卖点 lanes over the
 * ruler, the 片段标注 grammar, with the 卖点 counts as its legend), then 原片与口播: Douyin's player,
 * a cross-origin iframe the page cannot seek, beside the whole timed transcript, where a picked
 * block lights its lines. The 30 sample frames close the drawer as evidence.
 */

type Lane = 'framework' | 'sellingPoint';

interface Span {
  lane: Lane;
  index: number;
  startMs: number;
  endMs: number;
  name: string;
  tone: Tone;
  quote?: string;
}

// A block narrower than this share of the film shows its tone only: a clipped 「K…」 reads as noise.
// Its name and time stay in the tooltip and in the script heading once picked.
const MIN_LABEL_SHARE = 0.06;

function clock(ms: number): string {
  return formatClock(ms / 1000);
}

function spansOf(framework: CardFramework, lane: Lane): Span[] {
  const { labels, labelOrder } = framework;
  if (lane === 'framework') {
    return framework.segments.map((segment, index) => ({
      lane,
      index,
      startMs: segment.startMs,
      endMs: segment.endMs,
      name: labels.framework[segment.labelKey] ?? segment.labelKey,
      tone: toneOf(labelOrder.framework, segment.labelKey),
    }));
  }
  return framework.sellingPoints.map((point, index) => ({
    lane,
    index,
    startMs: point.startMs,
    endMs: point.endMs,
    name: point.labelKeys.map((key) => labels.sellingPoint[key] ?? key).join(' · '),
    tone: toneOf(labelOrder.sellingPoint, point.labelKeys[0]),
    quote: point.quote,
  }));
}

/** The 卖点 lane's legend: each label in its tone with how many spans carry it. */
function SellingPointLegend({ framework }: { framework: CardFramework }) {
  const counts = sellingPointCounts(framework);
  if (!counts.length) return null;
  return (
    <div className={timeline.timelineLane}>
      <span aria-hidden />
      <ul className={styles.legend} aria-label="卖点统计">
        {counts.map((item) => (
          <li key={item.key}>
            <span className={`${styles.legendDot} ${TONE_CLASSES[toneOf(framework.labelOrder.sellingPoint, item.key)]}`} aria-hidden />
            {item.name}
            <span className={styles.time}>×{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function openOnKey(event: KeyboardEvent<HTMLImageElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.currentTarget.click();
}

/**
 * The 30-frame contact sheet that closes the drawer; nothing for analyses without samples. A click
 * (or Enter) opens lobe's viewer on that frame, where ← → walk the whole sheet; hover only outlines.
 */
export function SampleSheet({ samples }: { samples: readonly EvidenceMedia[] }) {
  if (!samples.length) return null;
  return (
    <section className={styles.section} aria-labelledby="competitor-samples">
      <h3 id="competitor-samples">
        采样图<small>{samples.length} 张</small>
      </h3>
      <PreviewGroup>
        <ol className={styles.samples} aria-label="采样图">
          {samples.map((sample) => {
            const at = clock(sample.startMs);
            return (
              <li key={sample.url}>
                <Image
                  src={sample.url}
                  alt={`${at} 画面`}
                  title={at}
                  role="button"
                  tabIndex={0}
                  onKeyDown={openOnKey}
                  variant="borderless"
                  width="100%"
                  objectFit="cover"
                  className={styles.sample}
                  // A preview src unlike the thumbnail's makes the viewer fit the 320px frame to the
                  // window instead of showing it at its natural size; a fragment never reaches storage,
                  // so the signed URL stays valid.
                  preview={{ src: `${sample.url}#preview`, toolbarAddon: <span className={styles.sampleTime}>{at}</span> }}
                />
              </li>
            );
          })}
        </ol>
      </PreviewGroup>
    </section>
  );
}

interface StructureTimelineProps {
  framework: CardFramework;
  durationMs: number;
  picked: Span | null;
  /** Picking the lit block again clears the pick (null: the whole transcript, nothing lit). */
  onPick: (span: Span | null) => void;
}

function StructureTimeline({ framework, durationMs, picked, onPick }: StructureTimelineProps) {
  const hover = useTimelineHover(durationMs);
  const ticks = timelineTicks(durationMs);
  const lanes: Array<{ title: string; spans: Span[]; empty?: string }> = [
    { title: '框架', spans: spansOf(framework, 'framework'), empty: '没有切出框架段' },
    ...packRows(spansOf(framework, 'sellingPoint')).map((row, index) => ({ title: index === 0 ? '卖点' : '', spans: row })),
  ];
  if (!framework.sellingPoints.length) lanes.push({ title: '卖点', spans: [], empty: sellingPointsEmptyText(framework) });
  return (
    <div className={timeline.timelineScroll}>
      <div className={`${timeline.timeline} ${styles.timeline}`} role="group" aria-label="框架结构">
        {lanes.map((lane, laneIndex) => (
          <div key={laneIndex} className={timeline.timelineLane}>
            <span className={timeline.timelineLaneTitle}>{lane.title}</span>
            <div className={`${timeline.timelineTrack} ${styles.track}`} {...hover.hoverProps}>
              {hover.hoverMs !== null ? (
                <span className={timeline.hoverLine} style={{ left: timelinePercent(hover.hoverMs, durationMs) }} aria-hidden />
              ) : null}
              {ticks.slice(1).map((ms) => (
                <span key={ms} className={timeline.gridLine} style={{ left: timelinePercent(ms, durationMs) }} aria-hidden />
              ))}
              {lane.spans.length === 0 && lane.empty ? <span className={styles.laneEmpty}>{lane.empty}</span> : null}
              {lane.spans.map((span) => {
                const range = `${clock(span.startMs)}–${clock(span.endMs)}`;
                const active = picked?.lane === span.lane && picked.index === span.index;
                const className = [timeline.timelineBlock, TONE_CLASSES[span.tone], active ? timeline.timelineBlockActive : '']
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={`${span.lane}-${span.index}`}
                    type="button"
                    className={className}
                    style={{ left: timelinePercent(span.startMs, durationMs), width: timelinePercent(span.endMs - span.startMs, durationMs) }}
                    aria-label={`${span.name} ${range}`}
                    aria-pressed={active}
                    title={`${span.name} · ${range}`}
                    onClick={() => onPick(active ? null : span)}
                  >
                    {(span.endMs - span.startMs) / durationMs >= MIN_LABEL_SHARE ? <span>{span.name}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {/* The time reads under the blocks, like an editor's track. */}
        <TimelineRuler durationMs={durationMs} ticks={ticks} hover={hover} />
        <SellingPointLegend framework={framework} />
      </div>
    </div>
  );
}

interface StructureViewProps {
  awemeId: string | null;
  framework: CardFramework | null;
  /** The film's length; the timeline also stretches to the last span when it runs longer. */
  durationMs: number | null;
  /** 补充 / 重新生成 when the viewer may re-run the analysis. */
  action: ReactNode;
}

/** The framework segment a line opens in: its tone marks the line's left edge. */
function segmentOf(framework: CardFramework, line: TranscriptLine): Span | null {
  return spansOf(framework, 'framework').find((span) => line.startMs >= span.startMs && line.startMs < span.endMs) ?? null;
}

interface TranscriptProps {
  framework: CardFramework;
  picked: Span | null;
  onClear: () => void;
}

/** 口播转写: every timed line, the picked block's lines lit and scrolled to; the rest step back. */
function Transcript({ framework, picked, onClear }: TranscriptProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const litLines = new Set(picked ? linesWithin(framework.transcript, picked.startMs, picked.endMs) : []);

  useEffect(() => {
    const list = listRef.current;
    const first = list?.querySelector<HTMLElement>('[data-lit="true"]');
    // Only the list scrolls (the drawer stays put); on phones the list does not scroll at all.
    if (list && first) list.scrollTop = first.offsetTop;
    else if (list) list.scrollTop = 0;
  }, [picked]);

  return (
    <>
      <div className={styles.scriptHead}>
        <strong>口播转写</strong>
        {picked ? (
          <>
            <span className={styles.picked}>
              {picked.name}
              <span className={styles.time}>
                {clock(picked.startMs)}–{clock(picked.endMs)}
              </span>
            </span>
            <button type="button" className={styles.clear} onClick={onClear}>
              全部
            </button>
          </>
        ) : framework.transcript.length ? (
          <span className={styles.time}>{framework.transcript.length} 句</span>
        ) : null}
      </div>
      {picked?.quote ? <p className={styles.quote}>“{picked.quote}”</p> : null}
      {picked && framework.transcript.length && !litLines.size ? <p className={styles.empty}>这段没有口播。</p> : null}
      {framework.transcript.length ? (
        <ol ref={listRef} className={styles.script} aria-label="口播转写" data-picked={picked ? 'true' : undefined}>
          {framework.transcript.map((line) => {
            const segment = segmentOf(framework, line);
            return (
              <li key={line.startMs} data-lit={litLines.has(line) ? 'true' : undefined}>
                <span
                  className={`${styles.lineTone} ${segment ? TONE_CLASSES[segment.tone] : styles.lineToneNone}`}
                  title={segment?.name}
                  aria-hidden
                />
                <span className={styles.time}>{clock(line.startMs)}</span>
                <span>{line.text}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.empty}>{framework.transcriptError ? '口播转写失败，这条拆解没有口播文字。' : '这条视频没有口播。'}</p>
      )}
    </>
  );
}

interface StructureViewProps {
  awemeId: string | null;
  framework: CardFramework | null;
  /** The film's length; the timeline also stretches to the last span when it runs longer. */
  durationMs: number | null;
  /** 补充 / 重新生成 when the viewer may re-run the analysis. */
  action: ReactNode;
}

/** 框架结构 (timeline) and 原片与口播 (player + the whole transcript); nothing is picked to start. */
export function StructureView({ awemeId, framework, durationMs, action }: StructureViewProps) {
  const ready = framework?.status === 'ok' ? framework : null;
  const [picked, setPicked] = useState<{ lane: Lane; index: number } | null>(null);
  const spans = ready ? [...spansOf(ready, 'framework'), ...spansOf(ready, 'sellingPoint')] : [];
  const span = picked ? (spans.find((item) => item.lane === picked.lane && item.index === picked.index) ?? null) : null;
  const partial = ready ? partialText(ready) : null;
  const lengthMs = Math.max(durationMs ?? 0, ...spans.map((item) => item.endMs), ...(ready?.transcript ?? []).map((line) => line.endMs));

  return (
    <>
      {ready ? (
        <section className={styles.section} aria-labelledby="competitor-structure">
          <h3 id="competitor-structure">框架结构</h3>
          {spans.length ? (
            <StructureTimeline framework={ready} durationMs={lengthMs} picked={span} onPick={setPicked} />
          ) : (
            <p className={styles.empty}>没有切出框架段，也没有识别到卖点。</p>
          )}
          {/* Script or selling points missing: what stands, and the same re-run as a missing structure. */}
          {partial ? (
            <div className={styles.partial}>
              <p>{partial}</p>
              {action}
            </div>
          ) : null}
        </section>
      ) : null}
      <section className={styles.section} aria-labelledby="competitor-script">
        <h3 id="competitor-script">原片与口播</h3>
        <div className={styles.workbench}>
          {awemeId ? <CompetitorOriginalPlayer awemeId={awemeId} /> : null}
          <div className={styles.scriptColumn}>
            {ready ? (
              <Transcript framework={ready} picked={span} onClear={() => setPicked(null)} />
            ) : (
              <div className={styles.missing}>
                <p>{missingText(framework)}</p>
                {action}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function sellingPointsEmptyText(framework: CardFramework): string {
  if (framework.sellingPointError) return '卖点识别失败';
  if (framework.transcriptError) return '没有口播转写，未识别卖点';
  return '没有识别到卖点';
}

/** A structure that stands with a part missing; null when nothing failed. */
function partialText(framework: CardFramework): string | null {
  if (framework.transcriptError) return '口播转写失败：框架段已保留，没有口播文字和卖点。';
  if (framework.sellingPointError) return '卖点识别失败：框架段和口播转写已保留。';
  return null;
}

function missingText(framework: CardFramework | null): string {
  if (!framework) return '这条拆解早于框架结构上线，还没有框架、卖点和口播转写。';
  if (framework.status === 'unavailable') return `这次没有生成框架、卖点和口播转写：${framework.reason || '处理节点不支持'}。`;
  return `框架、卖点和口播转写生成失败${framework.reason ? `：${framework.reason}` : ''}。`;
}
