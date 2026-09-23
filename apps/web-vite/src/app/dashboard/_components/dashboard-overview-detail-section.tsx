import { DownloadOutlined, LoginOutlined } from '@ant-design/icons';
import { Button, Table } from 'antd';
import type { TableProps } from 'antd';

import { getQueryPlatformLabel, type QueryPlatform } from './dashboard-config';
import { formatTableRate } from './dashboard-formatters';
import {
  getNowcastQualityStatusLabel,
  normalizeNowcastQualityTone,
} from './dashboard-overview-labels';
import actionsStyles from './dashboard-detail-section-actions.module.css';
import exportHintStyles from './dashboard-detail-section-export-hint.module.css';
import metaStyles from './dashboard-detail-section-meta.module.css';
import nowcastStyles from './dashboard-detail-section-nowcast.module.css';
import qualityStatusStyles from './dashboard-detail-section-quality-status.module.css';
import styles from './dashboard-detail-section.module.css';
import { toSortableNumber } from './dashboard-sorters';
import type {
  DashboardOverviewDetailRow,
  DashboardOverviewNowcastQuality,
  NowcastQualityTone,
} from './dashboard-types';

export type DashboardOverviewDetailSectionProps = {
  isAuthenticated: boolean;
  isMobile: boolean;
  isExporting: boolean;
  disableExport: boolean;
  rows: DashboardOverviewDetailRow[];
  loading: boolean;
  columns: TableProps<DashboardOverviewDetailRow>['columns'];
  pagination: TableProps<DashboardOverviewDetailRow>['pagination'];
  nowcastAsOfDate: string | null;
  nowcastQuality: DashboardOverviewNowcastQuality | null;
  onExport: () => void;
  onNavigateLogin: () => void;
};

function getNowcastQualityStatusClassName(tone: NowcastQualityTone): string {
  switch (tone) {
    case 'pass':
      return qualityStatusStyles.qualityStatusTagPass;
    case 'alert':
      return qualityStatusStyles.qualityStatusTagAlert;
    case 'insufficient':
      return qualityStatusStyles.qualityStatusTagInsufficient;
    default:
      return qualityStatusStyles.qualityStatusTagUnknown;
  }
}

function formatNowcastAlertPlatforms(nowcastQuality: DashboardOverviewNowcastQuality | null): string {
  if (!Array.isArray(nowcastQuality?.alertPlatforms)) {
    return '';
  }

  return nowcastQuality.alertPlatforms
    .map((platform) => getQueryPlatformLabel(platform as Exclude<QueryPlatform, 'overview'>))
    .join('、');
}

export function DashboardOverviewDetailSection({
  isAuthenticated,
  isMobile,
  isExporting,
  disableExport,
  rows,
  loading,
  columns,
  pagination,
  nowcastAsOfDate,
  nowcastQuality,
  onExport,
  onNavigateLogin,
}: DashboardOverviewDetailSectionProps) {
  const nowcastQualityTone = normalizeNowcastQualityTone(nowcastQuality?.qualityStatus);
  const nowcastQualityStatusClassName = getNowcastQualityStatusClassName(nowcastQualityTone);
  const nowcastQualityWapeText = formatTableRate(nowcastQuality?.wape ?? null);
  const nowcastQualityThresholdText = formatTableRate(nowcastQuality?.thresholdWape ?? null);
  const nowcastQualitySampleCount =
    toSortableNumber(nowcastQuality?.sampleCount ?? null)?.toLocaleString('zh-CN') || '--';
  const nowcastQualityEvalAge = toSortableNumber(nowcastQuality?.evalAgeDays ?? null);
  const nowcastQualityEvalWindow = toSortableNumber(nowcastQuality?.evalWindowDays ?? null);
  const nowcastAlertPlatforms = formatNowcastAlertPlatforms(nowcastQuality);
  const nowcastModelVersion = nowcastQuality?.modelVersion?.trim() || '';
  const nowcastZeroMissCount = toSortableNumber(nowcastQuality?.zeroMissCount ?? null);

  return (
    <section className={styles.detailPanel}>
      <div className={actionsStyles.detailHead}>
        <div className={metaStyles.detailMeta}>
          <h3 className={metaStyles.detailMetaTitle}>经营明细</h3>
          {nowcastAsOfDate || nowcastQuality ? (
            <div className={nowcastStyles.nowcastQualityLine}>
              <span className={nowcastStyles.nowcastMetaTag}>
                {`nowcast as_of ${nowcastAsOfDate || '--'}`}
              </span>
              <span className={nowcastStyles.nowcastMetaText}>
                {nowcastQuality
                  ? `WAPE ${nowcastQualityWapeText} / 阈值 ${nowcastQualityThresholdText} · 样本 ${nowcastQualitySampleCount}`
                  : '预测质量评估待生成'}
              </span>
              {nowcastQuality ? (
                <span className={`${qualityStatusStyles.qualityStatusTag} ${nowcastQualityStatusClassName}`}>
                  {getNowcastQualityStatusLabel(nowcastQuality.qualityStatus)}
                </span>
              ) : null}
              {nowcastQuality && nowcastQualityEvalAge !== null && nowcastQualityEvalWindow !== null ? (
                <span className={nowcastStyles.nowcastMetaText}>
                  {`age=${nowcastQualityEvalAge}d / window=${nowcastQualityEvalWindow}d`}
                </span>
              ) : null}
              {nowcastModelVersion ? (
                <span className={nowcastStyles.nowcastMetaText}>{`model ${nowcastModelVersion}`}</span>
              ) : null}
              {nowcastZeroMissCount !== null && nowcastZeroMissCount > 0 ? (
                <span className={nowcastStyles.nowcastAlertText}>
                  {`零预测漏报 ${nowcastZeroMissCount.toLocaleString('zh-CN')}`}
                </span>
              ) : null}
              {nowcastQualityTone === 'alert' && nowcastAlertPlatforms ? (
                <span className={nowcastStyles.nowcastAlertText}>{`告警平台：${nowcastAlertPlatforms}`}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className={actionsStyles.detailActions}>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={isExporting}
            disabled={disableExport}
            block={isMobile}
            onClick={onExport}
          >
            导出明细
          </Button>
          {!isAuthenticated ? (
            <div className={exportHintStyles.exportHintWrap}>
              <p className={exportHintStyles.exportHint}>未登录不可下载明细</p>
              <Button
                type="link"
                size="small"
                icon={<LoginOutlined />}
                className={exportHintStyles.loginEntryButton}
                onClick={onNavigateLogin}
              >
                去登录后导出
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <Table<DashboardOverviewDetailRow>
        rowKey={(row) => `${row.date}-${row.platform}`}
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="small"
        sortDirections={['ascend', 'descend']}
        scroll={{ x: isMobile ? 3000 : 3450 }}
        pagination={pagination}
        locale={{
          emptyText: '当前筛选条件下暂无明细数据',
        }}
      />
    </section>
  );
}
