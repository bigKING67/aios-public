import { PlayCircleOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Segmented, Skeleton } from 'antd';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import { ROUTE_PATHS } from '@/lib/route-policy-registry';
import type { StudioOverviewPeriodKey, StudioOverviewResponse } from '../_lib/ai-studio-api';
import {
  buildOverviewFlow,
  overviewPeriodLabel,
  enterpriseLabel,
  formatCny,
  formatMinutes,
  formatTokens,
  OVERVIEW_PERIODS,
  overviewActivityView,
} from '../_lib/studio-overview';
import { AiStudioCapabilityGate } from './ai-studio-capability-gate';
import { useStudioOverview } from './use-ai-studio-queries';
import styles from '../ai-studio.module.css';

const PAGE_PURPOSE = '从原片切出可复用片段，按结构批量混剪，成片回写素材库并保留来源。';

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function AiStudioHome() {
  return (
    <AiStudioCapabilityGate title="AI 创作中心" purpose={PAGE_PURPOSE}>
      {(capabilities) => <StudioOverview enterpriseTag={capabilities.enterpriseTag} />}
    </AiStudioCapabilityGate>
  );
}

function StudioOverview({ enterpriseTag }: { enterpriseTag: string | null }) {
  const [period, setPeriod] = useState<StudioOverviewPeriodKey>('last30');
  const query = useStudioOverview(period, true);
  const overview = query.data;

  return (
    <section className={styles.panel} aria-labelledby="ai-studio-page-title" aria-busy={query.isFetching}>
      <header className={styles.pageHeader}>
        <div>
          <h1 id="ai-studio-page-title">AI 创作中心</h1>
          <p>{PAGE_PURPOSE}</p>
        </div>
        <Button icon={<PlayCircleOutlined />} href={`${ROUTE_PATHS.docsGuide}/ai-studio`} target="_blank" rel="noreferrer">
          使用指南
        </Button>
      </header>

      <StudioGuide />

      {query.isError ? (
        <Alert
          type="error"
          showIcon
          title="无法读取创作中心总览"
          description={query.error instanceof Error ? query.error.message : '请求失败，请稍后重试。'}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      ) : null}

      <CostSection
        overview={overview}
        loading={query.isPending}
        enterpriseTag={enterpriseTag}
        period={period}
        onPeriodChange={setPeriod}
      />

      <div className={styles.overviewGrid}>
        <article className={styles.card} aria-labelledby="ai-studio-flow-title">
          <h2 id="ai-studio-flow-title">制作链路</h2>
          <ol className={styles.flowList} aria-label="AI 创作制作链路">
            {buildOverviewFlow(overview, overviewPeriodLabel(period)).map((step) => (
              <li key={step.to}>
                <RouterLink className={styles.flowLink} to={step.to}>
                  <span className={styles.flowCopy}>
                    <strong>{step.label}</strong>
                    <span>{step.helper}</span>
                  </span>
                  {step.status ? <Badge status={step.status.tone}>{step.status.label}</Badge> : <span />}
                  <RightOutlined aria-hidden className={styles.flowChevron} />
                </RouterLink>
              </li>
            ))}
          </ol>
        </article>

        <article className={styles.card} aria-labelledby="ai-studio-recent-title">
          <h2 id="ai-studio-recent-title">最近任务</h2>
          <RecentActivity overview={overview} loading={query.isPending} />
        </article>
      </div>
    </section>
  );
}

const GUIDE_STORAGE_KEY = 'aiStudio.guideCollapsed';

const GUIDE_STEPS: readonly { title: string; detail: string; to: string }[] = [
  { title: '上传原片', detail: '在原片页点「上传原片」，选择产品。', to: ROUTE_PATHS.contentAiStudioAssets },
  { title: 'AI 分析', detail: '勾选原片开始分析，AI 按框架给出建议片段。', to: ROUTE_PATHS.contentAiStudioAnalysis },
  { title: '确认片段', detail: '逐条播放核对，确认或调整；确认后才进入片段素材。', to: ROUTE_PATHS.contentAiStudioSegments },
  { title: 'AI 剪辑', detail: '用框架混剪一次生成多条成片，或用单条剪辑精修一条。', to: ROUTE_PATHS.contentAiStudioEditing },
  { title: '下载成片', detail: '在成片页预览、下载，成片同时回存素材库。', to: ROUTE_PATHS.contentAiStudioOutputs },
];

function readGuideCollapsed(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** First-use walkthrough of the five steps; collapsing it is remembered per browser. */
function StudioGuide() {
  const [collapsed, setCollapsed] = useState(readGuideCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(GUIDE_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Private mode: the choice simply is not remembered.
    }
  };
  return (
    <article className={styles.card} aria-labelledby="ai-studio-guide-title">
      <div className={styles.cardHeading}>
        <h2 id="ai-studio-guide-title">怎么用</h2>
        <Button type="link" size="small" aria-expanded={!collapsed} onClick={toggle}>
          {collapsed ? '展开' : '收起'}
        </Button>
      </div>
      {collapsed ? null : (
        <>
          <ol className={styles.guideSteps}>
            {GUIDE_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className={styles.guideIndex} aria-hidden>{index + 1}</span>
                <span className={styles.guideCopy}>
                  <RouterLink to={step.to}>{step.title}</RouterLink>
                  <span>{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <ul className={styles.guideNotes}>
            <li>只有已确认、带产品的片段会进入混剪；片段素材里显示「待补」的框架，说明还缺这一类片段。</li>
            <li>AI 分析和云端合成按次计费，首页的费用是按公开标价的估算，以火山引擎账单为准。</li>
          </ul>
        </>
      )}
    </article>
  );
}

/** Costs and the 制作链路 counts share this period; the selector lives with the costs it mostly scopes. */
function CostSection({
  overview,
  loading,
  enterpriseTag,
  period,
  onPeriodChange,
}: {
  overview: StudioOverviewResponse | undefined;
  loading: boolean;
  enterpriseTag: string | null;
  period: StudioOverviewPeriodKey;
  onPeriodChange: (period: StudioOverviewPeriodKey) => void;
}) {
  const costs = overview?.costs;
  const model = costs?.modelAnalysis;
  const composition = costs?.cloudComposition;
  const resolutions = composition?.byResolution.map((item) => item.resolution).join('、');

  return (
    <article className={styles.card} aria-labelledby="ai-studio-cost-title">
      <div className={styles.cardHeading}>
        <h2 id="ai-studio-cost-title">费用估算</h2>
        <div className={styles.cardHeading}>
          {overview ? (
            <span>
              {enterpriseTag ? `${enterpriseLabel(enterpriseTag)} · ` : ''}
              {overview.scope === 'team' ? '全团队' : '仅我发起的任务'} · {overview.period.from} 至{' '}
              {overview.period.to}
            </span>
          ) : null}
          <Segmented<StudioOverviewPeriodKey>
            size="small"
            aria-label="统计周期"
            value={period}
            options={OVERVIEW_PERIODS.map((option) => ({ ...option }))}
            onChange={onPeriodChange}
          />
        </div>
      </div>
      {loading || !costs || !model || !composition ? (
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      ) : (
        <>
          <dl className={styles.costGrid}>
            <div className={styles.costTile}>
              <dt>合计</dt>
              <dd className={styles.costValue}>{formatCny(costs.totalCny)}</dd>
              <dd>多模态模型分析 + 云端合成</dd>
            </div>
            <div className={styles.costTile}>
              <dt>多模态模型分析</dt>
              <dd className={styles.costValue}>{formatCny(model.estimatedCny)}</dd>
              <dd>
                {model.calls} 次调用 · 输入 {formatTokens(model.inputTokens)} tokens · 输出{' '}
                {formatTokens(model.outputTokens)} tokens
              </dd>
              {model.unpricedCalls > 0 ? <dd>其中 {model.unpricedCalls} 次为未计价模型，未计入金额</dd> : null}
            </div>
            <div className={styles.costTile}>
              <dt>云端合成（AI MediaKit）</dt>
              <dd className={styles.costValue}>{formatCny(composition.estimatedCny)}</dd>
              <dd>
                {composition.tasks} 个合成任务 · 成片 {formatMinutes(composition.outputSeconds)}
                {resolutions ? ` · ${resolutions}` : ''}
              </dd>
            </div>
          </dl>
          <p className={styles.costNote}>
            按火山引擎公开标价估算（{model.pricing.model} {model.pricing.tier}：输入 ¥{model.pricing.inputPerMillion}
            、音频输入 ¥{model.pricing.audioInputPerMillion}、输出 ¥{model.pricing.outputPerMillion} / 百万 tokens；
            MediaKit 剪辑 ¥{composition.basePerMinute}/分钟 × 分辨率系数，核对于 {model.pricing.verifiedOn}），不含资源包抵扣，以账单为准。
          </p>
        </>
      )}
    </article>
  );
}

function RecentActivity({ overview, loading }: { overview: StudioOverviewResponse | undefined; loading: boolean }) {
  if (loading || !overview) return <Skeleton active paragraph={{ rows: 4 }} title={false} />;
  if (overview.recent.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有 AI 分析或剪辑任务" />;
  }
  return (
    <ul className={styles.activityList}>
      {overview.recent.map((activity) => {
        const view = overviewActivityView(activity);
        return (
          <li key={`${activity.kind}-${activity.id}`}>
            <RouterLink className={styles.activityLink} to={view.to}>
              <span className={styles.activityCopy}>
                <strong>{view.title}</strong>
                <span>
                  {view.kindLabel} · {formatTime(activity.createdAt)}
                  {view.detail ? ` · ${view.detail}` : ''}
                </span>
              </span>
              <Badge status={view.status.tone}>{view.status.label}</Badge>
            </RouterLink>
          </li>
        );
      })}
    </ul>
  );
}
