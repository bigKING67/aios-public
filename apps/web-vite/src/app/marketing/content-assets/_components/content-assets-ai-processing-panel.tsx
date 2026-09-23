import { Button, Popconfirm, Segmented, Select } from 'antd';
import { FileTextOutlined, RobotOutlined } from '@ant-design/icons';
import { CONTENT_ASSET_TODO_OPTIONS } from '../_lib/content-assets-filter-constants';
import { formatCompactNumber, formatDateTime } from '../_lib/content-assets-formatters';
import type {
  ContentAssetCoverageSummary,
  ContentAssetAiJobBackfillPayload,
  ContentAssetProcessingJobListResponse,
  ContentAssetTodoFilter,
} from '../_lib/content-assets-types';
import { ProcessingJobList } from './content-assets-processing-job-list';
import {
  AI_PROCESSING_JOB_TYPE_OPTIONS,
  PROCESSING_JOB_STATUS_FILTER_OPTIONS,
} from './content-assets-workspace-options';
import type {
  AiProcessingJobTypeFilter,
  ModuleMetric,
  ProcessingJobStatusFilter,
} from './content-assets-workspace-types';
import aiStyles from './content-assets-ai-processing-panel.module.css';
import styles from './content-assets-workspace-panels.module.css';

export function AiProcessingPanel({
  actionLoading,
  canManage,
  canWrite,
  coverage,
  data,
  jobStatus,
  jobType,
  loading,
  onCancelJob,
  onBackfillAiJobs,
  onJobStatusChange,
  onJobTypeChange,
  onOpenAssets,
  onOpenAssetsWithTodo,
  onRefresh,
  onResetStaleJob,
  onRetryJob,
}: {
  actionLoading: boolean;
  canManage: boolean;
  canWrite: boolean;
  coverage: ContentAssetCoverageSummary;
  data: ContentAssetProcessingJobListResponse | null;
  jobStatus: ProcessingJobStatusFilter;
  jobType: AiProcessingJobTypeFilter;
  loading: boolean;
  onCancelJob: (jobId: string) => void;
  onBackfillAiJobs: (payload: ContentAssetAiJobBackfillPayload) => void;
  onJobStatusChange: (value: ProcessingJobStatusFilter) => void;
  onJobTypeChange: (value: AiProcessingJobTypeFilter) => void;
  onOpenAssets: () => void;
  onOpenAssetsWithTodo: (value: ContentAssetTodoFilter) => void;
  onRefresh: () => void;
  onResetStaleJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
}) {
  const jobSummary = data?.summary;
  const items = data?.items || [];
  const pendingTranscript = Math.max(coverage.rawReadyAssets - coverage.transcriptReadyAssets, 0);
  const pendingAi = Math.max(coverage.rawReadyAssets - coverage.aiAnalyzedAssets, 0);
  const backfillDisabled = !canManage || actionLoading;
  const metrics: ModuleMetric[] = [
    { label: '已分析', value: formatCompactNumber(coverage.aiAnalyzedAssets), helper: '已有 AI 摘要/结构化结果' },
    { label: '待 AI', value: formatCompactNumber(pendingAi), helper: '原片已入库但未分析' },
    { label: '脚本未生成', value: formatCompactNumber(pendingTranscript), helper: '未生成口播转写 / SRT' },
    { label: '卡住任务', value: formatCompactNumber(jobSummary?.staleRunningJobs ?? 0), helper: '运行超 30 分钟且无进度更新' },
  ];

  return (
    <section className={styles.workspacePanel}>
      <div className={styles.moduleHero}>
        <div className={styles.moduleIcon}><RobotOutlined /></div>
        <div>
          <span>智能分析</span>
          <h1>AI分析中心</h1>
          <p>集中看 AI 分析和脚本/SRT 队列。这里不虚构洞察，只展示真实任务、失败原因和下一步处理入口。</p>
        </div>
      </div>

      <section className={styles.metricGrid} aria-label="AI分析指标">
        {metrics.map((metric) => (
          <article className={styles.metricCard} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.helper}</p>
          </article>
        ))}
      </section>

      <section className={styles.videoProcessingGrid}>
        <article className={styles.flowCard}>
          <div className={styles.sectionTitle}>
            <RobotOutlined />
            <div>
              <strong>AI / 脚本任务队列</strong>
              <p>
                最近完成：{jobSummary?.latestFinishedAt ? formatDateTime(jobSummary.latestFinishedAt) : '--'}
                {loading ? ' · 正在刷新' : ''}
              </p>
            </div>
            <Button size="small" onClick={onRefresh}>
              刷新
            </Button>
          </div>
          <div className={styles.queueToolbar}>
            <Segmented<ProcessingJobStatusFilter>
              value={jobStatus}
              options={PROCESSING_JOB_STATUS_FILTER_OPTIONS}
              onChange={onJobStatusChange}
            />
            <Select<AiProcessingJobTypeFilter>
              className={styles.queueTypeSelect}
              size="small"
              value={jobType}
              options={AI_PROCESSING_JOB_TYPE_OPTIONS}
              onChange={onJobTypeChange}
            />
          </div>
          <ProcessingJobList
            actionLoading={actionLoading}
            canManage={canManage}
            canWrite={canWrite}
            emptyDescription="当前筛选下暂无 AI / 脚本任务"
            items={items}
            loading={loading}
            onCancelJob={onCancelJob}
            onOpenAssets={onOpenAssets}
            onResetStaleJob={onResetStaleJob}
            onRetryJob={onRetryJob}
          />
        </article>

        <article className={styles.actionCard}>
          <div className={styles.sectionTitle}>
            <FileTextOutlined />
            <div>
              <strong>分析动作入口</strong>
              <p>批量排队只创建任务，实际分析由后台处理器异步执行。</p>
            </div>
          </div>
          <div className={aiStyles.backfillPanel}>
            <div>
              <strong>批量创建任务</strong>
              <p>默认自动选择预览版/原片作为输入，每次最多排队 100 条，避免一次性挤爆后台处理器。</p>
            </div>
            <div className={aiStyles.backfillActions}>
              <Popconfirm
                title="批量创建 AI 分析任务？"
                description="系统会为待 AI 的视频排队，已有结果或运行中任务会跳过。"
                okText="确认排队"
                cancelText="取消"
                onConfirm={() =>
                  onBackfillAiJobs({
                    jobType: 'analysis',
                    source: 'auto',
                    profile: 'preview_fast',
                    limit: 100,
                  })
                }
              >
                <Button size="small" type="primary" disabled={backfillDisabled}>
                  排队 AI 分析
                </Button>
              </Popconfirm>
              <Popconfirm
                title="批量创建脚本/SRT 任务？"
                description="脚本/SRT 与 AI 分析独立，会为缺脚本的视频排队。"
                okText="确认排队"
                cancelText="取消"
                onConfirm={() =>
                  onBackfillAiJobs({
                    jobType: 'transcript',
                    source: 'auto',
                    limit: 100,
                  })
                }
              >
                <Button size="small" disabled={backfillDisabled}>
                  排队脚本/SRT
                </Button>
              </Popconfirm>
            </div>
          </div>
          <div className={styles.actionList}>
            {[
              ['待 AI 分析素材', '过滤还没有 AI 结果的已入库视频', 'missing_ai'],
              ['待生成脚本素材', '过滤还没有脚本/SRT 的视频', 'missing_transcript'],
              ['待绑定视频 ID', '让平台视频日报可以回流到 asset_id', 'missing_platform_video'],
              ['待绑定素材 ID', '让千川等广告日报可以按素材 ID 回流', 'missing_ad_material'],
            ].map(([label, helper, value]) => (
              <button
                className={styles.actionRow}
                key={label}
                type="button"
                onClick={() => onOpenAssetsWithTodo(value as ContentAssetTodoFilter)}
              >
                <strong>{label}</strong>
                <span>{helper}</span>
              </button>
            ))}
          </div>
          <div className={aiStyles.aiScopeNote}>
            <strong>当前边界</strong>
            <p>
              AI 分析用于理解素材；脚本/SRT 用于剪辑和复盘。两条链路状态独立，不再用“已分析”替代“已生成脚本”。
            </p>
            <div>
              {CONTENT_ASSET_TODO_OPTIONS.slice(0, 4).map((option) => (
                <button key={option.value} type="button" onClick={() => onOpenAssetsWithTodo(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </article>
      </section>
    </section>
  );
}
