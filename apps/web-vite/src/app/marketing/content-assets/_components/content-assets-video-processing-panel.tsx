import { Button, Popconfirm, Segmented, Select } from 'antd';
import { CheckCircleOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { formatCompactNumber, formatDateTime } from '../_lib/content-assets-formatters';
import type {
  ContentAssetProcessingJobListResponse,
  ContentAssetSummary,
} from '../_lib/content-assets-types';
import { ProcessingJobList } from './content-assets-processing-job-list';
import {
  PROCESSING_JOB_STATUS_FILTER_OPTIONS,
  PROCESSING_JOB_TYPE_FILTER_OPTIONS,
} from './content-assets-workspace-options';
import type {
  ModuleMetric,
  ProcessingJobStatusFilter,
  ProcessingJobTypeFilter,
} from './content-assets-workspace-types';
import styles from './content-assets-workspace-panels.module.css';

export function VideoProcessingPanel({
  actionLoading,
  canManage,
  canWrite,
  data,
  loading,
  processingJobStatus,
  processingJobType,
  summary,
  onBackfillDerivativeJobs,
  onOpenAssets,
  onCancelJob,
  onProcessingJobStatusChange,
  onProcessingJobTypeChange,
  onRefresh,
  onResetStaleJob,
  onRetryJob,
}: {
  actionLoading: boolean;
  canManage: boolean;
  canWrite: boolean;
  data: ContentAssetProcessingJobListResponse | null;
  loading: boolean;
  processingJobStatus: ProcessingJobStatusFilter;
  processingJobType: ProcessingJobTypeFilter;
  summary: ContentAssetSummary;
  onBackfillDerivativeJobs: () => void;
  onOpenAssets: () => void;
  onCancelJob: (jobId: string) => void;
  onProcessingJobStatusChange: (value: ProcessingJobStatusFilter) => void;
  onProcessingJobTypeChange: (value: ProcessingJobTypeFilter) => void;
  onRefresh: () => void;
  onResetStaleJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
}) {
  const jobSummary = data?.summary;
  const items = data?.items || [];
  const metrics: ModuleMetric[] = [
    { label: '排队任务', value: formatCompactNumber(jobSummary?.queuedJobs ?? 0), helper: '等待处理进程消费' },
    { label: '运行中', value: formatCompactNumber(jobSummary?.runningJobs ?? 0), helper: '正在生成预览 / 封面' },
    { label: '卡住任务', value: formatCompactNumber(jobSummary?.staleRunningJobs ?? 0), helper: '运行超 30 分钟且无进度更新' },
    { label: '待生成素材', value: formatCompactNumber(summary.pendingAssets), helper: '资产状态：待生成' },
  ];

  return (
    <section className={styles.workspacePanel}>
      <div className={styles.moduleHero}>
        <div className={styles.moduleIcon}><VideoCameraOutlined /></div>
        <div>
          <span>视频处理链路</span>
          <h1>视频处理</h1>
          <p>管理原片入桶后的预览视频、封面生成队列。这里是处理状态看板，不会触发转码或下载。</p>
        </div>
      </div>

      <section className={styles.metricGrid} aria-label="视频处理指标">
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
            <VideoCameraOutlined />
            <div>
              <strong>处理任务队列</strong>
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
              value={processingJobStatus}
              options={PROCESSING_JOB_STATUS_FILTER_OPTIONS}
              onChange={onProcessingJobStatusChange}
            />
            <Select<ProcessingJobTypeFilter>
              className={styles.queueTypeSelect}
              size="small"
              value={processingJobType}
              options={PROCESSING_JOB_TYPE_FILTER_OPTIONS}
              onChange={onProcessingJobTypeChange}
            />
          </div>
          <ProcessingJobList
            actionLoading={actionLoading}
            canManage={canManage}
            canWrite={canWrite}
            emptyDescription="当前筛选下暂无处理任务"
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
            <CheckCircleOutlined />
            <div>
              <strong>处理说明</strong>
              <p>上传完成后自动排队。处理进程运行时才会下载原片并消耗 TOS 流量。</p>
            </div>
          </div>
          <div className={styles.backfillBox}>
            <div>
              <strong>补建预览 / 封面队列</strong>
              <p>为已入库但缺少派生文件的原片视频补建处理任务。这里只写入数据库队列，不会启动处理进程。</p>
            </div>
            <Popconfirm
              title="确认补建队列任务？"
              description="该操作只创建预览 / 封面队列，不会下载 TOS 原片，也不会触发转码。"
              okText="补建队列"
              cancelText="取消"
              onConfirm={onBackfillDerivativeJobs}
            >
              <Button type="primary" loading={actionLoading} disabled={!canManage || summary.pendingAssets <= 0}>
                补建队列
              </Button>
            </Popconfirm>
          </div>
          <div className={styles.actionList}>
            {[
              ['查看待生成素材', '定位待生成 / 处理中资产'],
              ['检查失败任务', '根据错误信息判断是 TOS、FFmpeg 还是文件问题'],
              ['确认封面展示', '封面生成后列表卡片会显示真实封面'],
            ].map(([label, helper]) => (
              <button className={styles.actionRow} key={label} type="button" onClick={onOpenAssets}>
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
