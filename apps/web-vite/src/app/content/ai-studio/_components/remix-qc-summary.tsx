import type { ReactNode } from 'react';
import type { StudioRemixBatchItem } from '../_lib/remix-api';
import { formatSegmentTime } from '../_lib/segment-time';
import styles from './remix-qc-summary.module.css';

type RemixQc = NonNullable<StudioRemixBatchItem['qc']>;
type RemixQcReport = NonNullable<RemixQc['report']>;

const MAX_REPORT_ITEMS = 20;
const NUMBER = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });

const QC_REASON_LABELS: Record<string, string> = {
  frame_freeze: '画面卡帧',
  timestamp_gap: '时间戳断层',
  av_offset: '音画不同步',
  duplicate_picture: '重复画面',
  source_changed: '源片已变化',
  technical_inspection: '技术检查未完成',
  incomplete: '检查未完成',
};

const QC_STATUS = {
  passed: { label: '自动质检通过', className: styles.passed },
  failed: { label: '自动质检未通过', className: styles.failed },
  incomplete: { label: '自动质检未完成', className: styles.incomplete },
} as const;

const ERROR_STAGE_LABELS: Record<string, string> = {
  binding: '报告绑定',
  timing: '时间戳与音视频起止',
  freeze: '冻帧检查',
  pictures: '图片抽样检查',
  sources: '源片一致性检查',
  technical_inspection: '技术检查',
};

function sourceLabel(status: string): string {
  if (status === 'passed') return '源片一致';
  if (status === 'failed') return '源片已变化';
  return '源片未完成核对';
}

function details(qc: RemixQc): string[] {
  const result = qc.reasons.flatMap((reason) => {
    if (reason === 'frame_freeze' && qc.freezeCount > 0) return [];
    if (reason === 'timestamp_gap' && qc.timestampGapCount > 0) return [];
    if (reason === 'duplicate_picture' && qc.duplicatePairCount > 0) return [];
    if (reason === 'source_changed' && qc.sourceStatus === 'failed') return [];
    if (reason === 'av_offset' && qc.maxAvOffsetMs !== null) return [`音画偏移超限 ${Math.round(qc.maxAvOffsetMs)} ms`];
    return [QC_REASON_LABELS[reason] ?? reason];
  });
  if (qc.freezeCount > 0) result.push(`卡帧 ${qc.freezeCount} 处`);
  if (qc.timestampGapCount > 0) result.push(`时间戳断层 ${qc.timestampGapCount} 处`);
  if (qc.duplicatePairCount > 0) result.push(`重复画面 ${qc.duplicatePairCount} 组`);
  if (qc.maxAvOffsetMs !== null && !qc.reasons.includes('av_offset')) result.push(`最大音画偏移 ${Math.round(qc.maxAvOffsetMs)} ms`);
  result.push(sourceLabel(qc.sourceStatus));
  if (qc.status === 'passed' && qc.freezeCount === 0 && qc.timestampGapCount === 0 && qc.duplicatePairCount === 0) {
    result.unshift('未发现卡帧、时间戳断层或重复画面');
  }
  return [...new Set(result)];
}

function checkStatus(status: string) {
  const state = status === 'passed' ? QC_STATUS.passed : status === 'failed' ? QC_STATUS.failed : status === 'incomplete' ? QC_STATUS.incomplete : null;
  const label = status === 'passed' ? '通过' : status === 'failed' ? '未通过' : status === 'incomplete' ? '未完成' : '未验证';
  return (
    <span className={`${styles.checkStatus} ${state?.className ?? styles.unverified}`}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}

function value(value: number | null, unit = ''): string {
  return value === null ? '未记录' : `${NUMBER.format(value)}${unit}`;
}

function signedMs(valueInMs: number | null): string {
  if (valueInMs === null) return '未记录';
  const sign = valueInMs > 0 ? '+' : '';
  return `${sign}${NUMBER.format(valueInMs)} ms`;
}

function partialText(total: number, shown: number): string | null {
  if (total <= shown) return null;
  return shown > 0
    ? `共 ${total} 处，当前仅展示 ${shown} 处，报告为部分展示。`
    : `共 ${total} 处，位置明细未返回，报告为部分展示。`;
}

function ReportRows({ rows }: { rows: readonly [string, ReactNode][] }) {
  return (
    <dl className={styles.reportGrid}>
      {rows.map(([label, content]) => (
        <div key={label} className={styles.reportRow}>
          <dt>{label}</dt>
          <dd>{content}</dd>
        </div>
      ))}
    </dl>
  );
}

function QcReport({ qc, report }: { qc: RemixQc; report: RemixQcReport }) {
  const freezeEvents = report.freezeEvents.slice(0, MAX_REPORT_ITEMS);
  const freezeTotal = Math.max(report.freezeEventCount, report.freezeEvents.length);
  const freezePartial = partialText(freezeTotal, freezeEvents.length);
  const timestampGaps = report.timestampGaps.slice(0, MAX_REPORT_ITEMS);
  const timestampTotal = Math.max(qc.timestampGapCount, report.timestampGaps.length);
  const timestampPartial = partialText(timestampTotal, timestampGaps.length);
  return (
    <details className={styles.report}>
      <summary>查看质检报告</summary>
      <div className={styles.reportBody}>
        <section className={styles.reportSection} aria-labelledby="remix-qc-checks-title">
          <h4 id="remix-qc-checks-title">检查状态</h4>
          <ReportRows rows={[
            ['时间戳与音视频起止', checkStatus(report.timingStatus)],
            ['冻帧', checkStatus(report.freezeStatus)],
            ['图片抽样', checkStatus(report.pictureStatus)],
            ['源片一致性', checkStatus(qc.sourceStatus)],
          ]} />
        </section>

        <section className={styles.reportSection} aria-labelledby="remix-qc-thresholds-title">
          <h4 id="remix-qc-thresholds-title">本次检查阈值</h4>
          <ReportRows rows={[
            ['冻帧持续', value(report.freezeThresholdMs, ' ms')],
            ['音视频起止偏差', value(report.avOffsetThresholdMs, ' ms')],
            ['时间戳间隔', value(report.ptsGapThresholdMs, ' ms')],
            ['冻帧噪声', value(report.freezeNoiseDb, ' dB')],
            ['图片相似距离上限', value(report.pictureMaxDistance)],
            ['图片纹理下限', value(report.pictureMinTexture)],
          ]} />
        </section>

        <section className={styles.reportSection} aria-labelledby="remix-qc-measured-title">
          <h4 id="remix-qc-measured-title">检查结果</h4>
          <ReportRows rows={[
            ['视频帧数', value(report.frameCount)],
            ['音频起始偏差', signedMs(report.audioStartOffsetMs)],
            ['音频结束偏差', signedMs(report.audioEndOffsetMs)],
            ['已检查片段', value(report.checkedSegments, ' 段')],
            ['冻帧记录', `${freezeTotal} 处`],
            ['时间戳问题', `${timestampTotal} 处`],
            ['重复画面', `${qc.duplicatePairCount} 组`],
            ['检查停止阶段', report.errorStage ? ERROR_STAGE_LABELS[report.errorStage] ?? '检查未完成' : '无'],
          ]} />
        </section>

        <section className={styles.reportSection} aria-labelledby="remix-qc-freeze-title">
          <h4 id="remix-qc-freeze-title">冻帧位置</h4>
          {freezeEvents.length > 0 ? (
            <ul className={styles.reportList} aria-label="冻帧位置">
              {freezeEvents.map((event, index) => (
                <li key={`${event.startMs}-${event.endMs}-${index}`}>
                  <span>{formatSegmentTime(event.startMs)}–{formatSegmentTime(event.endMs)}</span>
                  <span>{event.sourceExempt ? '原片静止，已豁免' : '需人工复核'}</span>
                </li>
              ))}
            </ul>
          ) : <p className={styles.reportEmpty}>没有返回冻帧位置。</p>}
          {freezePartial ? <p className={styles.reportPartial}>{freezePartial}</p> : null}
        </section>

        <section className={styles.reportSection} aria-labelledby="remix-qc-timestamp-title">
          <h4 id="remix-qc-timestamp-title">时间戳问题位置</h4>
          {timestampGaps.length > 0 ? (
            <ul className={styles.reportList} aria-label="时间戳问题位置">
              {timestampGaps.map((gap, index) => (
                <li key={`${gap.frame}-${index}`}>
                  <span>第 {gap.frame} 帧</span>
                  <span>间隔 {value(gap.deltaMs, ' ms')}</span>
                </li>
              ))}
            </ul>
          ) : <p className={styles.reportEmpty}>没有返回时间戳问题位置。</p>}
          {timestampPartial ? <p className={styles.reportPartial}>{timestampPartial}</p> : null}
        </section>

        <p className={styles.reportNote}>
          音视频起止偏差只衡量轨道起止，不代表口型或语句同步。图片检查基于抽样帧，仍需人工完整观看成片。
        </p>
      </div>
    </details>
  );
}

/** Bounded business projection of automatic QC. Missing historical data is explicitly unverified. */
export function RemixQcSummary({ qc, compact = false }: { qc?: RemixQc | null; compact?: boolean }) {
  const state = qc ? QC_STATUS[qc.status as keyof typeof QC_STATUS] ?? QC_STATUS.incomplete : null;
  const label = state?.label ?? '自动质检未验证';
  const summary = qc ? details(qc) : ['历史成片没有质检记录'];
  return (
    <div className={`${styles.summary} ${compact ? styles.compact : ''}`} aria-label={`${label}：${summary.join('；')}`}>
      <span className={`${styles.status} ${state?.className ?? styles.unverified}`}>
        <span className={styles.dot} aria-hidden="true" />
        {label}
      </span>
      <span className={styles.details}>{summary.join(' · ')}</span>
      {!compact && qc?.report ? <QcReport qc={qc} report={qc.report} /> : null}
      {!compact && qc && !qc.report ? <span className={styles.reportMissing}>质检报告明细未保留，仅显示摘要。</span> : null}
    </div>
  );
}
