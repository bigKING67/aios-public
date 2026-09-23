import { ContentProductionWorkbench } from './content-production-workbench';
import { Button } from 'antd';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import type {
  ContentAssetProcessingJobListResponse,
  ContentAssetAiJobBackfillPayload,
  ContentAssetCoverageSummary,
  ContentAssetSummary,
  ContentAssetTodoFilter,
  ContentAssetUnmatchedStatsItem,
  ContentAssetUnmatchedStatsMatchTypeFilter,
  ContentAssetUnmatchedStatsResponse,
} from '../_lib/content-assets-types';
import type { ContentAssetsModuleKey } from './content-assets-module-nav-config';
import { AiProcessingPanel } from './content-assets-ai-processing-panel';
import { resolveModuleReadiness } from './content-assets-module-readiness';
import { UnmatchedStatsPanel } from './content-assets-unmatched-stats-panel';
import { VideoProcessingPanel } from './content-assets-video-processing-panel';
import { createCoverageTodos, createHomeMetrics, createModuleConfig } from './content-assets-workspace-config';
import type {
  AssetListPreset,
  AiProcessingJobTypeFilter,
  ProcessingJobStatusFilter,
  ProcessingJobTypeFilter,
} from './content-assets-workspace-types';
import styles from './content-assets-workspace-panels.module.css';

interface ContentAssetsWorkspacePanelProps {
  activeModule: ContentAssetsModuleKey;
  aiProcessingJobStatus: ProcessingJobStatusFilter;
  aiProcessingJobType: AiProcessingJobTypeFilter;
  aiProcessingJobsData: ContentAssetProcessingJobListResponse | null;
  aiProcessingJobsLoading: boolean;
  canManage: boolean;
  canWrite: boolean;
  processingJobActionLoading: boolean;
  processingJobsData: ContentAssetProcessingJobListResponse | null;
  processingJobsLoading: boolean;
  processingJobStatus: ProcessingJobStatusFilter;
  processingJobType: ProcessingJobTypeFilter;
  coverage: ContentAssetCoverageSummary;
  summary: ContentAssetSummary;
  unmatchedStatsActionLoading: boolean;
  unmatchedStatsData: ContentAssetUnmatchedStatsResponse | null;
  unmatchedStatsLoading: boolean;
  unmatchedStatsMatchType: ContentAssetUnmatchedStatsMatchTypeFilter;
  unmatchedBindTargetAssetId: string | null;
  unmatchedAssetOptions: Array<{ label: string; value: string; helper: string }>;
  onBackfillDerivativeJobs: () => void;
  onBackfillAiJobs: (payload: ContentAssetAiJobBackfillPayload) => void;
  onBindUnmatchedStats: (item: ContentAssetUnmatchedStatsItem) => void;
  onOpenAssets: () => void;
  onOpenAssetsWithPreset: (preset: AssetListPreset) => void;
  onOpenAssetsWithTodo: (todo: ContentAssetTodoFilter) => void;
  onOpenModule: (module: ContentAssetsModuleKey) => void;
  onAiProcessingJobStatusChange: (value: ProcessingJobStatusFilter) => void;
  onAiProcessingJobTypeChange: (value: AiProcessingJobTypeFilter) => void;
  onProcessingJobStatusChange: (value: ProcessingJobStatusFilter) => void;
  onProcessingJobTypeChange: (value: ProcessingJobTypeFilter) => void;
  onRefreshAiProcessingJobs: () => void;
  onRefreshProcessingJobs: () => void;
  onRefreshUnmatchedStats: () => void;
  onRetryProcessingJob: (jobId: string) => void;
  onCancelProcessingJob: (jobId: string) => void;
  onResetStaleProcessingJob: (jobId: string) => void;
  onUnmatchedBindTargetAssetChange: (assetId: string | null) => void;
  onUnmatchedStatsMatchTypeChange: (value: ContentAssetUnmatchedStatsMatchTypeFilter) => void;
  onUploadOpen: () => void;
}

export function ContentAssetsWorkspacePanel({
  activeModule,
  aiProcessingJobStatus,
  aiProcessingJobType,
  aiProcessingJobsData,
  aiProcessingJobsLoading,
  canManage,
  canWrite,
  processingJobActionLoading,
  processingJobsData,
  processingJobsLoading,
  processingJobStatus,
  processingJobType,
  coverage,
  summary,
  unmatchedStatsActionLoading,
  unmatchedStatsData,
  unmatchedStatsLoading,
  unmatchedStatsMatchType,
  unmatchedBindTargetAssetId,
  unmatchedAssetOptions,
  onBackfillDerivativeJobs,
  onBackfillAiJobs,
  onBindUnmatchedStats,
  onOpenAssets,
  onOpenAssetsWithPreset,
  onOpenAssetsWithTodo,
  onOpenModule,
  onAiProcessingJobStatusChange,
  onAiProcessingJobTypeChange,
  onProcessingJobStatusChange,
  onProcessingJobTypeChange,
  onRefreshAiProcessingJobs,
  onRefreshProcessingJobs,
  onRefreshUnmatchedStats,
  onRetryProcessingJob,
  onCancelProcessingJob,
  onResetStaleProcessingJob,
  onUnmatchedBindTargetAssetChange,
  onUnmatchedStatsMatchTypeChange,
  onUploadOpen,
}: ContentAssetsWorkspacePanelProps) {
  if (activeModule === 'production') return <ContentProductionWorkbench />;

  if (activeModule === 'home') {
    return (
      <section className={styles.workspacePanel}>
        <div className={styles.heroRow}>
          <div className={styles.heroCopy}>
            <h1>今天需要处理的素材事项</h1>
            <p>
              首页只展示真实待办：源视频入库、预览封面、AI分析、脚本、平台视频 ID、广告素材 ID 和授权信息覆盖。
            </p>
            <div className={styles.heroActions}>
              <Button type="primary" icon={<CloudUploadOutlined />} disabled={!canWrite} onClick={onUploadOpen}>
                上传视频素材
              </Button>
              <Button icon={<AppstoreOutlined />} onClick={onOpenAssets}>
                进入素材库
              </Button>
            </div>
          </div>
        </div>

        <section className={styles.metricGrid} aria-label="素材库首页指标">
          {createHomeMetrics(coverage).map((metric) => (
            <article className={styles.metricCard} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.helper}</p>
            </article>
          ))}
        </section>

        <section className={styles.todoGrid} aria-label="素材库真实待办">
          {createCoverageTodos(coverage).map((todo) => (
            <button
              className={styles.todoCard}
              key={todo.label}
              type="button"
              onClick={() => onOpenAssetsWithPreset(todo.preset)}
            >
              <span>{todo.label}</span>
              <strong>{todo.value}</strong>
              <p>{todo.helper}</p>
            </button>
          ))}
        </section>

        <section className={styles.homeGrid}>
          <article className={styles.flowCard}>
            <div className={styles.sectionTitle}>
              <CheckCircleOutlined />
              <div>
                <strong>状态必须拆开看</strong>
                <p>已分析不等于已有脚本；已入库也不等于可直接投放。</p>
              </div>
            </div>
            <div className={styles.flowSteps}>
              {['上传原片', '生成预览 / 封面', 'AI分析', '生成脚本/SRT', '绑定视频ID', '绑定素材ID'].map((step, index) => (
                <div className={styles.flowStep} key={step}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{step}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.actionCard}>
            <div className={styles.sectionTitle}>
              <FileSearchOutlined />
              <div>
                <strong>今天先做什么</strong>
                <p>高频操作入口，不再依赖飞书作为日常上传入口。</p>
              </div>
            </div>
            <div className={styles.actionList}>
              {[
                { label: '上传视频源文件', helper: '直传到 TOS 原片分层', onClick: onUploadOpen },
                { label: '补平台视频 ID', helper: `${Math.max(coverage.totalAssets - coverage.platformBoundAssets, 0)} 条素材还没有视频 / 笔记身份`, onClick: onOpenAssets },
                { label: '补广告素材 ID', helper: `${Math.max(coverage.totalAssets - coverage.adMaterialBoundAssets, 0)} 条素材还没有千川素材 ID`, onClick: onOpenAssets },
                { label: '查看生成队列', helper: '切到视频处理面板确认预览 / 封面状态', onClick: () => onOpenModule('video') },
              ].map(({ label, helper, onClick }) => (
                <button className={styles.actionRow} key={label} type="button" onClick={onClick}>
                  <strong>{label}</strong>
                  <span>{helper}</span>
                </button>
              ))}
            </div>
          </article>
        </section>
      </section>
    );
  }

  if (activeModule === 'video') {
    return (
      <VideoProcessingPanel
        data={processingJobsData}
        canManage={canManage}
        canWrite={canWrite}
        actionLoading={processingJobActionLoading}
        loading={processingJobsLoading}
        processingJobStatus={processingJobStatus}
        processingJobType={processingJobType}
        summary={summary}
        onBackfillDerivativeJobs={onBackfillDerivativeJobs}
        onOpenAssets={onOpenAssets}
        onProcessingJobStatusChange={onProcessingJobStatusChange}
        onProcessingJobTypeChange={onProcessingJobTypeChange}
        onRefresh={onRefreshProcessingJobs}
        onRetryJob={onRetryProcessingJob}
        onCancelJob={onCancelProcessingJob}
        onResetStaleJob={onResetStaleProcessingJob}
      />
    );
  }

  if (activeModule === 'ai') {
    return (
      <AiProcessingPanel
        actionLoading={processingJobActionLoading}
        canManage={canManage}
        canWrite={canWrite}
        coverage={coverage}
        data={aiProcessingJobsData}
        jobStatus={aiProcessingJobStatus}
        jobType={aiProcessingJobType}
        loading={aiProcessingJobsLoading}
        onCancelJob={onCancelProcessingJob}
        onBackfillAiJobs={onBackfillAiJobs}
        onJobStatusChange={onAiProcessingJobStatusChange}
        onJobTypeChange={onAiProcessingJobTypeChange}
        onOpenAssets={onOpenAssets}
        onOpenAssetsWithTodo={onOpenAssetsWithTodo}
        onRefresh={onRefreshAiProcessingJobs}
        onRetryJob={onRetryProcessingJob}
        onResetStaleJob={onResetStaleProcessingJob}
      />
    );
  }

  if (activeModule === 'matching') {
    return (
      <UnmatchedStatsPanel
        actionLoading={unmatchedStatsActionLoading}
        assetOptions={unmatchedAssetOptions}
        bindTargetAssetId={unmatchedBindTargetAssetId}
        canWrite={canWrite}
        data={unmatchedStatsData}
        loading={unmatchedStatsLoading}
        matchType={unmatchedStatsMatchType}
        onBind={onBindUnmatchedStats}
        onBindTargetAssetChange={onUnmatchedBindTargetAssetChange}
        onMatchTypeChange={onUnmatchedStatsMatchTypeChange}
        onOpenAssets={onOpenAssets}
        onRefresh={onRefreshUnmatchedStats}
      />
    );
  }

  const config = createModuleConfig(activeModule, summary);
  const readiness = resolveModuleReadiness(activeModule);
  return (
    <section className={styles.workspacePanel}>
      <div className={styles.moduleHero}>
        <div className={styles.moduleIcon}>{config.icon}</div>
        <div>
          <span>{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <span className={styles.moduleStatePill}>{readiness.stateLabel}</span>
      </div>

      <section className={styles.moduleReadiness} aria-label={`${config.title} 接入状态`}>
        <div className={styles.moduleReadinessMain}>
          <div className={styles.sectionTitle}>
            <FileSearchOutlined />
            <div>
              <strong>当前真实入口</strong>
              <p>{readiness.currentEntry}</p>
            </div>
          </div>
          <div className={styles.readinessGrid}>
            {readiness.items.map((item) => (
              <div className={styles.readinessItem} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.helper}</p>
              </div>
            ))}
          </div>
        </div>
        <aside className={styles.moduleReadinessSide}>
          <div className={styles.sectionTitle}>
            <CheckCircleOutlined />
            <div>
              <strong>避免假完整页面</strong>
              <p>{readiness.pendingScope}</p>
            </div>
          </div>
          <div className={styles.readinessActions}>
            <Button type="primary" icon={<AppstoreOutlined />} onClick={onOpenAssets}>
              进入素材库
            </Button>
            <Button icon={<CloudUploadOutlined />} disabled={!canWrite} onClick={onUploadOpen}>
              上传素材
            </Button>
          </div>
        </aside>
      </section>
    </section>
  );
}
