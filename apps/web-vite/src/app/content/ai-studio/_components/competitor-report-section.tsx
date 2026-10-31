import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, SkeletonText } from '@lobehub/ui';
import { Surface } from '@lobehub/ui/dashboard';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AiActionButton } from '@/components/molecules/ai-action-button';
import { AiMark } from '@/components/molecules/ai-mark';
import { AiTaskStatus } from '@/components/molecules/ai-task-status';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { formatFilmShare, scenePointName } from '../_lib/competitor-breakdown';
import type { PatternPayload } from '../_lib/competitor-patterns';
import {
  competitorReportQueryKeys,
  ESTIMATED_CNY_PER_REPORT,
  fetchLatestCompetitorReport,
  isReportActive,
  PRIORITY_NAMES,
  readLatestReport,
  type ReportView,
  requestCompetitorReport,
} from '../_lib/competitor-report';
import type { PeriodQuery } from '../_lib/studio-period';
import { useOpeningFormulas } from '../_lib/use-opening-formulas';
import { formatShortTimestamp } from '../_lib/studio-time';
import { CompetitorBreakdownBlocks } from './competitor-breakdown-blocks';
import styles from './competitor-report.module.css';

const ACTIVE_POLL_MS = 5000;

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。';
}

interface CompetitorReportSectionProps {
  category: string;
  period: PeriodQuery;
  canWrite: boolean;
  /** The statistics snapshot of the page; its `breakdown` feeds the three blocks. */
  payload: PatternPayload | null;
  /** Input of the statistics on the page: when it changes (a window computed, new analyses) the report state is read again. */
  inputSnapshot: string | null;
}

/**
 * 爆款拆解: the snapshot's three blocks (开头 3 秒怎么说, 在什么场景解决什么痛点, 谁在背书) before any
 * report, then on demand the report's formulas and readings, 黄金结构 and 下一条怎么拍. Every number
 * comes from the snapshot or the rows the report stored; the model writes sentences only.
 */
export function CompetitorReportSection({ category, period, canWrite, payload, inputSnapshot }: CompetitorReportSectionProps) {
  const openings = useOpeningFormulas(category, period, inputSnapshot, canWrite);
  const queryClient = useQueryClient();
  const queryKey = competitorReportQueryKeys.latest(category, period);
  const query = useQuery({
    queryKey: [...queryKey, inputSnapshot],
    queryFn: ({ signal }) => fetchLatestCompetitorReport(category, period, { signal }),
    refetchInterval: (current) => (isReportActive(readLatestReport(current.state.data).report) ? ACTIVE_POLL_MS : false),
  });
  const generate = useMutation({
    mutationFn: () => requestCompetitorReport(category, period),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const { report, stale, films, minFilms } = readLatestReport(query.data);
  const enough = films !== null && films >= minFilms;
  const succeeded = report?.status === 'succeeded' ? report : null;
  const generateButton = (label: string) =>
    canWrite ? (
      <AiActionButton size="small" loading={generate.isPending} onClick={() => generate.mutate()}>
        {label}
      </AiActionButton>
    ) : null;
  const breakdown = payload?.breakdown ?? null;

  let reportBody: ReactNode;
  if (query.isPending) {
    reportBody = <SkeletonText rows={2} />;
  } else if (query.isError) {
    reportBody = (
      <Alert
        type="error"
        showIcon
        title="爆款拆解读取失败"
        description={errorText(query.error)}
        action={<Button onClick={() => void query.refetch()}>重试</Button>}
      />
    );
  } else if (isReportActive(report)) {
    reportBody = (
      <AiTaskStatus
        state={report?.status === 'queued' ? 'queued' : 'thinking'}
        label="正在把开头原句归纳成公式，并解读场景、背书和结构，通常 2–3 分钟完成"
      />
    );
  } else if (succeeded) {
    reportBody = (
      <ReportBody
        report={succeeded}
        stale={stale && enough}
        regenerate={generateButton('按新统计重新生成')}
        requestError={generate.isError ? errorText(generate.error) : null}
      />
    );
  } else if (films === null) {
    // No statistics for this window yet (being computed, or no analysed films): nothing to read.
    reportBody = <p className={styles.note}>这个时间范围的统计生成后，才能生成拆解。</p>;
  } else if (!enough) {
    reportBody = (
      <p className={styles.note}>
        样本不足：当前 {films} 条，至少 {minFilms} 条才生成拆解。可以换更长的时间范围，或到{' '}
        <RouterLink className={styles.inlineLink} to={ROUTE_PATHS.contentAiStudioTrends}>
          爆款视频
        </RouterLink>{' '}
        添加并拆解更多竞品。
      </p>
    );
  } else {
    reportBody = (
      <div className={styles.body}>
        {report?.status === 'failed' ? (
          <AiTaskStatus state="failed" label={report.errorMessage ?? '拆解没有生成'} action={generateButton('重新生成')} />
        ) : (
          <div className={styles.start}>
            <p className={styles.note}>
              结合开头公式，解读场景和背书，给出最多 3 条“下一条怎么拍”。数字由系统统计，AI 只负责归纳。
            </p>
            <div className={styles.startAction}>
              {generateButton('生成拆解')}
              <span className={styles.estimate}>约 ¥{ESTIMATED_CNY_PER_REPORT}/次，统计不变时不重复计费</span>
            </div>
          </div>
        )}
        {generate.isError ? <Alert type="error" showIcon title="拆解没有发起" description={errorText(generate.error)} /> : null}
      </div>
    );
  }

  return (
    <Surface
      title={
        <span className={styles.title}>
          爆款拆解
          <AiMark title={report?.modelId ? `${report.modelId}${report.finishedAt ? ` · ${formatShortTimestamp(report.finishedAt)}` : ''}` : undefined} />
        </span>
      }
    >
      <div className={styles.body}>
        {payload && breakdown ? (
          <CompetitorBreakdownBlocks breakdown={breakdown} payload={payload} report={succeeded && !stale ? succeeded : null} openings={openings} />
        ) : payload ? (
          <p className={styles.note}>新版统计（开头公式、场景痛点、背书人）正在生成，几分钟后自动显示。</p>
        ) : null}
        {reportBody}
      </div>
    </Surface>
  );
}

function ReportBody({
  report,
  stale,
  regenerate,
  requestError,
}: {
  report: ReportView;
  stale: boolean;
  regenerate: ReactNode;
  requestError: string | null;
}) {
  const films = report.sample.films;
  const structureOf = new Map(report.structures.map((structure) => [structure.id, structure]));
  return (
    <>
      <p className={styles.extra}>
        拆解基于 {films} 条
        {report.finishedAt ? ` · 生成于 ${formatShortTimestamp(report.finishedAt)}` : ''}
        {report.costYuan !== null ? ` · 费用 ¥${report.costYuan.toFixed(3)}` : ''}
        {report.formulaStatus === 'fallback' ? ' · 这份旧拆解的公式未通过校验' : ''}
      </p>
      {stale ? (
        <div className={styles.stale} role="status">
          <span>统计已更新，下面的拆解基于之前的数据，上方公式和解读已隐藏。</span>
          {regenerate}
        </div>
      ) : null}
      {requestError ? <Alert type="error" showIcon title="拆解没有发起" description={requestError} /> : null}

      {report.goldenStructures.length ? (
        <section aria-labelledby="report-golden">
          <h3 id="report-golden" className={styles.subhead}>黄金结构</h3>
          <ol className={styles.insights}>
            {report.goldenStructures.map((reading, index) => (
              <li key={index} className={styles.insight}>
                <p className={styles.statement}>{reading.statement}</p>
                <p className={styles.detail}>
                  {reading.refs
                    .map((ref) => structureOf.get(ref))
                    .filter((structure) => structure !== undefined)
                    .map((structure) => `${structure.name}（${formatFilmShare(structure, films)}）`)
                    .join('；')}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {report.actions.length ? (
        <section aria-labelledby="report-actions">
          <h3 id="report-actions" className={styles.subhead}>下一条怎么拍</h3>
          <ol className={styles.actions}>
            {report.actions.map((action) => (
              <li key={action.id} className={styles.action}>
                <span className={styles.priority} data-priority={action.priority}>
                  {PRIORITY_NAMES[action.priority] ?? action.priority}
                </span>
                <div className={styles.actionBody}>
                  <p className={styles.statement}>{action.description}</p>
                  <p className={styles.detail}>
                    {[
                      action.structure && `结构：${action.structure.name}`,
                      action.formula && `开头：${action.formula.template}`,
                      action.scene && `场景：${action.scene.scene} → ${action.scene.pain} → ${scenePointName(action.scene)}`,
                      action.sellingPoints && `卖点：${action.sellingPoints}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className={styles.caption}>
        只基于公开视频的内容统计，没有曝光和成交数据：条数多只说明这样拍的竞品多，不说明它带来了销量。我方数据接入视频云管家后再做对照。
        {report.limitations.length ? ` 这份拆解的局限：${report.limitations.join('；')}。` : ''}
      </p>
    </>
  );
}
