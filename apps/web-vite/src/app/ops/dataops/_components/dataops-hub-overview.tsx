'use client';

import { Alert, Button, Input, Select } from 'antd';
import {
  BellOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import type { DataOpsStatus } from '@/config/dataops-hub';
import hubStyles from './dataops-hub.module.css';
import overviewStyles from './dataops-overview.module.css';
import shellStyles from './dataops-shell.module.css';

interface DataOpsHubMetrics {
  totalPipelines: number;
  healthyPipelines: number;
  warningPipelines: number;
  errorPipelines: number;
  pausedPipelines: number;
  avgLagMinutes: number;
  notificationFailureCount24h: number;
  healthyRate: number;
}

type DataOpsHubMetricStatusKey = 'healthy' | 'warning' | 'error' | 'paused';

interface DataOpsHubMetricStatusItem {
  key: DataOpsHubMetricStatusKey;
  segmentRatio: number;
}

interface DataOpsHubTabItem {
  key: string;
  label: string;
}

export interface DataOpsHubOverviewProps {
  englishName: string;
  pageName: string;
  metrics: DataOpsHubMetrics;
  metricStatusItems: readonly DataOpsHubMetricStatusItem[];
  snapshotAt: string;
  runtimeStorageModeLabel: string;
  runtimeLockModeLabel: string;
  hasOperatePermission: boolean;
  hasImportantRisk: boolean;
  defaultAlertChannelName: string;
  keywordInput: string;
  onKeywordInputChange: (value: string) => void;
  statusFilter: DataOpsStatus | 'all';
  onStatusFilterChange: (value: DataOpsStatus | 'all') => void;
  runtimeFetching: boolean;
  onRefreshRuntime: () => void;
  onOpenRuntimeDetails: () => void;
  systemNoticeCount: number;
  runtimeErrorMessage?: string;
  runtimeWarnings: string[];
  tabItems: readonly DataOpsHubTabItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  statusFilterLabel: string;
  keywordFilterText: string;
  filteredPipelineCount: number;
}

export function DataOpsHubOverview({
  englishName,
  pageName,
  metrics,
  metricStatusItems,
  snapshotAt,
  runtimeStorageModeLabel,
  runtimeLockModeLabel,
  hasOperatePermission,
  hasImportantRisk,
  defaultAlertChannelName,
  keywordInput,
  onKeywordInputChange,
  statusFilter,
  onStatusFilterChange,
  runtimeFetching,
  onRefreshRuntime,
  onOpenRuntimeDetails,
  systemNoticeCount,
  runtimeErrorMessage,
  runtimeWarnings,
  tabItems,
  activeTab,
  onTabChange,
  statusFilterLabel,
  keywordFilterText,
  filteredPipelineCount,
}: DataOpsHubOverviewProps) {
  const metricStatusClassNameMap: Record<DataOpsHubMetricStatusKey, string> = {
    healthy: overviewStyles.metricMainStackHealthy,
    warning: overviewStyles.metricMainStackWarning,
    error: overviewStyles.metricMainStackError,
    paused: overviewStyles.metricMainStackPaused,
  };

  return (
    <>
      <header className={overviewStyles.opsHeader}>
        <div className={overviewStyles.opsTitleBlock}>
          <div className={overviewStyles.opsEyebrowRow}>
            <span>{englishName}</span>
            <span
              className={`${overviewStyles.opsHealthPill} ${
                metrics.errorPipelines > 0
                  ? overviewStyles.opsHealthPillError
                  : metrics.warningPipelines > 0
                    ? overviewStyles.opsHealthPillWarning
                    : overviewStyles.opsHealthPillOk
              }`}
            >
              {metrics.errorPipelines > 0
                ? '异常优先'
                : metrics.warningPipelines > 0
                  ? '需要关注'
                  : '运行正常'}
            </span>
          </div>
          <h1>{pageName}</h1>
          <p>
            快照 {snapshotAt} · 运行态 {runtimeStorageModeLabel} ·{' '}
            {hasOperatePermission ? '可执行操作' : '只读模式'}
          </p>
        </div>

        <div className={overviewStyles.opsControlPanel}>
          <Input
            allowClear
            value={keywordInput}
            onChange={(event) => onKeywordInputChange(event.target.value)}
            placeholder="搜索任务名、Flow、表名"
            className={overviewStyles.keywordInput}
          />
          <Select<DataOpsStatus | 'all'>
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={[
              { label: '全部状态', value: 'all' },
              { label: '健康', value: 'healthy' },
              { label: '关注', value: 'warning' },
              { label: '异常', value: 'error' },
              { label: '停用', value: 'paused' },
            ]}
            className={overviewStyles.statusSelect}
          />
          <Button icon={<ReloadOutlined />} onClick={onRefreshRuntime} loading={runtimeFetching}>
            刷新
          </Button>
          <Button icon={<DatabaseOutlined />} onClick={onOpenRuntimeDetails}>
            运行态
          </Button>
        </div>
      </header>

      <section className={overviewStyles.opsSignalGrid} aria-label="DataOps 核心状态">
        <article
          className={`${overviewStyles.opsSignalCard} ${
            hasImportantRisk ? overviewStyles.opsSignalCardRisk : overviewStyles.opsSignalCardOk
          }`}
        >
          <div className={overviewStyles.opsSignalHead}>
            <span>编排覆盖</span>
            <SyncOutlined />
          </div>
          <strong>{metrics.healthyRate}%</strong>
          <div className={overviewStyles.metricMainStackBar} aria-hidden>
            {metricStatusItems.map((item) => (
              <span
                key={`${item.key}-bar`}
                className={`${overviewStyles.metricMainStackSegment} ${metricStatusClassNameMap[item.key]}`}
                style={{ width: `${item.segmentRatio}%` }}
              />
            ))}
          </div>
          <p>
            健康 {metrics.healthyPipelines} · 关注 {metrics.warningPipelines} · 异常{' '}
            {metrics.errorPipelines} · 停用 {metrics.pausedPipelines}
          </p>
        </article>

        <article className={overviewStyles.opsSignalCard}>
          <div className={overviewStyles.opsSignalHead}>
            <span>平均延迟</span>
            <ClockCircleOutlined />
          </div>
          <strong>{metrics.avgLagMinutes}m</strong>
          <p>同步链路最近延迟均值</p>
        </article>

        <article
          className={`${overviewStyles.opsSignalCard} ${
            metrics.notificationFailureCount24h > 0 ? overviewStyles.opsSignalCardRisk : ''
          }`}
        >
          <div className={overviewStyles.opsSignalHead}>
            <span>通知失败 24h</span>
            <BellOutlined />
          </div>
          <strong>{metrics.notificationFailureCount24h}</strong>
          <p>默认通道：{defaultAlertChannelName}</p>
        </article>

        <article className={overviewStyles.opsSignalCard}>
          <div className={overviewStyles.opsSignalHead}>
            <span>运行态存储</span>
            <DatabaseOutlined />
          </div>
          <strong className={overviewStyles.opsSignalTextValue}>{runtimeStorageModeLabel}</strong>
          <p>锁模式：{runtimeLockModeLabel}</p>
        </article>
      </section>

      {systemNoticeCount > 0 ? (
        <section className={overviewStyles.noticeDock}>
          <div className={overviewStyles.noticeBody}>
            {hasImportantRisk ? (
              <p className={overviewStyles.noticeEmphasisText}>
                检测到异常或关注任务，建议优先处理并排查运行链路。
              </p>
            ) : null}

            {runtimeErrorMessage ? (
              <Alert
                className={shellStyles.riskAlert}
                type="error"
                showIcon
                title="运行态接口请求失败"
                description={runtimeErrorMessage}
              />
            ) : null}

            {runtimeWarnings.length ? (
              <section className={overviewStyles.noticeSection}>
                <div className={overviewStyles.noticeSectionHead}>
                  <strong>运行态提示</strong>
                  <span>共 {runtimeWarnings.length} 条</span>
                </div>
                <ul className={hubStyles.noticeWarningList}>
                  {runtimeWarnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!hasOperatePermission ? (
              <p className={overviewStyles.noticeMutedText}>
                当前账号为只读模式：可以查看运行态、同步链路和通知审计，不能触发/暂停/恢复任务或测试 Webhook。
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className={overviewStyles.workspaceHeader}>
        <div className={overviewStyles.tabRail} role="tablist" aria-label="DataOps 视图切换">
          {tabItems.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`${overviewStyles.tabButton}${active ? ` ${overviewStyles.tabButtonActive}` : ''}`}
                onClick={() => onTabChange(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className={overviewStyles.workspaceMeta}>
          状态 {statusFilterLabel} · 关键字 {keywordFilterText} · 任务 {filteredPipelineCount} /
          {metrics.totalPipelines}
        </div>
      </div>
    </>
  );
}
