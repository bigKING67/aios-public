import { Alert, Button, Empty, SkeletonText, Tooltip } from '@lobehub/ui';
import { BookOpen, Info } from 'lucide-react';
import { useState } from 'react';
import { Navigate, Link as RouterLink } from 'react-router-dom';
import { AiTaskStatus } from '@/components/molecules/ai-task-status';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import { isTeamOutputOnlyByRole } from '@/lib/role-access';
import { selectUserRoles, useAuthStore } from '@/stores/auth.store';
import type { StudioOverviewResponse } from '../_lib/ai-studio-api';
import {
  buildOverviewFlow,
  overviewPeriodLabel,
  enterpriseLabel,
  formatCny,
  formatMinutes,
  formatTokens,
  overviewActivityView,
} from '../_lib/studio-overview';
import { defaultPeriodSelection, periodQuery, type PeriodSelection } from '../_lib/studio-period';
import { AiStudioCapabilityGate } from './ai-studio-capability-gate';
import { StudioPeriodControl } from './studio-period-control';
import { useStudioOverview } from './use-ai-studio-queries';
import styles from '../ai-studio.module.css';
import home from './studio-home.module.css';

const PAGE_PURPOSE = '用 AI 剪辑把原片批量做成成片，从竞品爆款里找到可借鉴的打法。';

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function AiStudioHome() {
  const roles = useAuthStore(selectUserRoles);
  const user = useAuthStore((state) => state.user);
  // An account limited to 团队产出 (HR) lands there: the studio home is its entry, not its page.
  if (isTeamOutputOnlyByRole(roles, { username: user?.username, email: user?.email, fullName: user?.full_name })) {
    return <Navigate to={ROUTE_PATHS.contentAiStudioTeamOutput} replace />;
  }
  return (
    <AiStudioCapabilityGate title="AI 创作中心" purpose={PAGE_PURPOSE}>
      {(capabilities) => <StudioOverview enterpriseTag={capabilities.enterpriseTag} />}
    </AiStudioCapabilityGate>
  );
}

function StudioOverview({ enterpriseTag }: { enterpriseTag: string | null }) {
  // 日 at yesterday by default: the newest complete day, whether or not anything ran on it.
  const [selection, setSelection] = useState<PeriodSelection>(defaultPeriodSelection);
  const query = useStudioOverview(periodQuery(selection), true);
  const overview = query.data;

  return (
    <section className={home.page} aria-labelledby="ai-studio-page-title" aria-busy={query.isFetching}>
      <header className={`${styles.pageHeader} ${home.header}`}>
        <div>
          <h1 id="ai-studio-page-title">AI 创作中心</h1>
          <p>{PAGE_PURPOSE}</p>
        </div>
        <div className={home.headerActions}>
          {/* The period scopes the chain's period counts and the costs; live counts and 最近任务 ignore it. */}
          <StudioPeriodControl selection={selection} period={overview?.period} onChange={setSelection} />
          <Button
            type="text"
            size="small"
            icon={<BookOpen size={14} strokeWidth={1.8} aria-hidden="true" />}
            href={`${ROUTE_PATHS.docsGuide}/ai-studio`}
            target="_blank"
            rel="noreferrer"
          >
            使用指南
          </Button>
        </div>
      </header>

      {query.isError ? (
        <Alert
          type="error"
          showIcon
          title="无法读取创作中心总览"
          description={query.error instanceof Error ? query.error.message : '请求失败，请稍后重试。'}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      ) : null}

      <FlowStrip overview={overview} />

      <div className={home.columns}>
        <section className={home.section} aria-labelledby="ai-studio-recent-title">
          <div className={home.sectionHead}>
            <h2 id="ai-studio-recent-title" className={home.sectionTitle}>最近任务</h2>
          </div>
          <RecentActivity overview={overview} loading={query.isPending} />
        </section>
        <CostSection overview={overview} loading={query.isPending} enterpriseTag={enterpriseTag} />
      </div>
    </section>
  );
}

/**
 * The five-step chain, each step one number: it doubles as the walkthrough (the steps link to
 * their pages in order) and the pipeline status. Dots mark only AI at work and work waiting on a person.
 */
function FlowStrip({ overview }: { overview: StudioOverviewResponse | undefined }) {
  return (
    <ol className={home.flow} aria-label="AI 创作制作链路">
      {buildOverviewFlow(overview, overviewPeriodLabel(overview?.period)).map((step) => (
        <li key={step.label}>
          <RouterLink
            className={home.flowStep}
            to={step.to}
            aria-label={step.metric ? `${step.label}：${step.metric.value} ${step.metric.caption}` : step.label}
          >
            <span className={home.flowLabel}>{step.label}</span>
            <span className={home.flowValue}>{step.metric ? step.metric.value : '–'}</span>
            <span className={home.flowCaption}>
              {step.metric?.signal ? <span className={home.dot} data-signal={step.metric.signal} aria-hidden="true" /> : null}
              {step.metric?.caption ?? '\u00a0'}
            </span>
          </RouterLink>
        </li>
      ))}
    </ol>
  );
}

/** Estimated spend for the period; the pricing basis sits behind the info mark instead of a footnote. */
function CostSection({
  overview,
  loading,
  enterpriseTag,
}: {
  overview: StudioOverviewResponse | undefined;
  loading: boolean;
  enterpriseTag: string | null;
}) {
  const costs = overview?.costs;
  const model = costs?.modelAnalysis;
  const composition = costs?.cloudComposition;
  const resolutions = composition?.byResolution.map((item) => item.resolution).join('、');
  const basis =
    model && composition
      ? `按火山引擎公开标价估算：${model.pricing.model} ${model.pricing.tier} 输入 ¥${model.pricing.inputPerMillion}、音频输入 ¥${model.pricing.audioInputPerMillion}、输出 ¥${model.pricing.outputPerMillion} / 百万 tokens；MediaKit 剪辑 ¥${composition.basePerMinute}/分钟 × 分辨率系数（核对于 ${model.pricing.verifiedOn}）。不含资源包抵扣，以账单为准。`
      : null;

  return (
    <section className={home.section} aria-labelledby="ai-studio-cost-title">
      <div className={home.sectionHead}>
        <h2 id="ai-studio-cost-title" className={home.sectionTitle}>费用估算</h2>
        {basis ? (
          <Tooltip title={basis}>
            <button type="button" className={home.infoButton} aria-label={`估算口径：${basis}`}>
              <Info size={14} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </Tooltip>
        ) : null}
        {/* In the heading row, not under it, so the first rule lines up with 最近任务's. */}
        {overview ? (
          <p className={home.scope} title={`${overview.period.from} 至 ${overview.period.to}`}>
            {enterpriseTag ? `${enterpriseLabel(enterpriseTag)} · ` : ''}
            {overview.scope === 'team' ? '全团队' : '仅我发起的任务'} · {overview.period.from.slice(5)} 至 {overview.period.to.slice(5)}
          </p>
        ) : null}
      </div>
      {loading || !costs || !model || !composition ? (
        <SkeletonText rows={3} />
      ) : (
        <dl className={home.costList}>
          <div className={home.costRow}>
            <dt>合计</dt>
            <dd className={home.costTotal}>{formatCny(costs.totalCny)}</dd>
          </div>
          <div className={home.costRow}>
            <dt>多模态模型分析</dt>
            <dd className={home.costValue}>{formatCny(model.estimatedCny)}</dd>
            <dd className={home.costDetail}>
              {model.calls} 次调用 · 输入 {formatTokens(model.inputTokens)} · 输出 {formatTokens(model.outputTokens)} tokens
              {model.unpricedCalls > 0 ? ` · ${model.unpricedCalls} 次未计价，未计入金额` : ''}
            </dd>
          </div>
          <div className={home.costRow}>
            <dt>云端合成</dt>
            <dd className={home.costValue}>{formatCny(composition.estimatedCny)}</dd>
            <dd className={home.costDetail}>
              {composition.tasks} 个任务 · 成片 {formatMinutes(composition.outputSeconds)}
              {resolutions ? ` · ${resolutions}` : ''}
            </dd>
          </div>
        </dl>
      )}
      {/* The caveat stays visible on every device; the full pricing basis is behind the info mark. */}
      {costs ? <p className={home.costBasis}>按公开标价估算，以火山引擎账单为准</p> : null}
    </section>
  );
}

function RecentActivity({ overview, loading }: { overview: StudioOverviewResponse | undefined; loading: boolean }) {
  if (loading || !overview) return <SkeletonText rows={4} />;
  if (overview.recent.length === 0) {
    return <Empty description="还没有 AI 切段或合成任务" />;
  }
  return (
    <ul className={home.activityList}>
      {overview.recent.map((activity) => {
        const view = overviewActivityView(activity);
        return (
          <li key={`${activity.kind}-${activity.id}`}>
            <RouterLink className={home.activityLink} to={view.to}>
              <span className={home.activityTitle}>{view.title}</span>
              <span className={home.activityMeta}>
                {view.kindLabel} · {formatTime(activity.createdAt)}
                {view.detail ? ` · ${view.detail}` : ''}
              </span>
              <AiTaskStatus compact state={view.status.state} stateLabel={view.status.label} />
            </RouterLink>
          </li>
        );
      })}
    </ul>
  );
}
