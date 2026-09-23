import type { CSSProperties, ReactNode } from 'react';
import { Empty, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsCoreOption } from 'echarts/core';

import { GOODS_SCORE_CONFIDENCE_FOOTNOTE_TEXT } from './dashboard-config';
import type { GoodsQuadrantKey } from './dashboard-config';
import { DashboardChart } from './dashboard-chart';
import {
  formatSignedRatePercent,
  formatTableNumber,
  formatTableRate,
} from './dashboard-formatters';
import type { DashboardGoodsMatrixQuadrantSummaryItem } from './dashboard-goods-matrix-model';
import dynamicVarStyles from './dashboard-dynamic-vars.module.css';
import metricsTableStyles from './dashboard-goods-data-table-metrics.module.css';
import scoreRowStyles from './dashboard-goods-data-table-score-rows.module.css';
import tableShellStyles from './dashboard-goods-data-table-shell.module.css';
import goodsDetailStyles from './dashboard-goods-detail-section.module.css';
import matrixStyles from './dashboard-goods-detail-section-matrix.module.css';
import scoreStyles from './dashboard-goods-detail-section-score.module.css';
import tableStyles from './dashboard-goods-detail-section-table.module.css';
import noticeStyles from './dashboard-notice.module.css';
import type {
  DashboardGoodsApiResponse,
  DashboardGoodsScoreDetailItem,
  DashboardGoodsTableItem,
} from './dashboard-types';

export type DashboardGoodsDetailSectionProps = {
  isMobile: boolean;
  loadError: string | null;
  summary?: DashboardGoodsApiResponse['summary'];
  matrixSummary: DashboardGoodsMatrixQuadrantSummaryItem[];
  visibleQuadrants: GoodsQuadrantKey[];
  matrixOption: EChartsCoreOption;
  matrixThresholdDescription: string;
  textInverseColor: string;
  rangeLabel: string;
  asOfDate: string;
  scorePoolN: number;
  scoreVisibleCount: number;
  rows: DashboardGoodsTableItem[];
  columns: ColumnsType<DashboardGoodsTableItem>;
  loading: boolean;
  selectedScoreDetail: DashboardGoodsScoreDetailItem | null;
  scoreOption: EChartsCoreOption;
  getTrendClassNameByRate: (value: number | null | undefined) => string;
  onToggleQuadrant: (quadrant: GoodsQuadrantKey) => void;
  onScoreRowClick: (row: DashboardGoodsTableItem) => void;
  onScoreBarClick: (params: unknown) => void;
};

function resolveGoodsTableEmptyText(loading: boolean, loadError: string | null): ReactNode {
  if (loading) {
    return '商品经营数据加载中';
  }
  if (loadError) {
    return '商品经营数据加载失败，请查看上方提示';
  }
  return <Empty description="当前筛选条件下暂无商品数据" />;
}

function resolveGoodsScoreChartHeight(isMobile: boolean, scoreVisibleCount: number): number {
  const rowCount = Math.max(scoreVisibleCount, 1);
  const rowBand = isMobile ? 36 : 40;
  const minHeight = isMobile ? 320 : 360;
  const maxHeight = isMobile ? 460 : 560;
  const targetHeight = rowCount * rowBand + 116;
  return Math.min(maxHeight, Math.max(minHeight, targetHeight));
}

export function DashboardGoodsDetailSection({
  isMobile,
  loadError,
  summary,
  matrixSummary,
  visibleQuadrants,
  matrixOption,
  matrixThresholdDescription,
  textInverseColor,
  rangeLabel,
  asOfDate,
  scorePoolN,
  scoreVisibleCount,
  rows,
  columns,
  loading,
  selectedScoreDetail,
  scoreOption,
  getTrendClassNameByRate,
  onToggleQuadrant,
  onScoreRowClick,
  onScoreBarClick,
}: DashboardGoodsDetailSectionProps) {
  const matrixHeaderExtra = (
    <div className={matrixStyles.matrixSummary}>
      {matrixSummary.map((item) => {
        const isActive = visibleQuadrants.includes(item.key);
        return (
          <button
            key={item.key}
            type="button"
            className={`${matrixStyles.matrixSummaryItem} ${dynamicVarStyles.goodsMatrixSummaryTone}${
              isActive
                ? ` ${matrixStyles.matrixSummaryItemActive}`
                : ` ${matrixStyles.matrixSummaryItemInactive}`
            }`}
            aria-pressed={isActive}
            onClick={() => onToggleQuadrant(item.key)}
            style={
              {
                '--goods-matrix-summary-bg': isActive ? item.color : undefined,
                '--goods-matrix-summary-border': isActive ? item.color : undefined,
                '--goods-matrix-summary-text': isActive ? textInverseColor : undefined,
                '--goods-matrix-summary-dot': isActive ? textInverseColor : item.color,
              } as CSSProperties
            }
          >
            <span className={`${matrixStyles.matrixSummaryDot} ${dynamicVarStyles.goodsMatrixSummaryDotTone}`} />
            <span>{item.label}</span>
            <span>{`${item.count}款`}</span>
            <span>{`GMV占比 ${formatTableRate(item.gmvShare)}`}</span>
          </button>
        );
      })}
    </div>
  );
  const matrixDefinitionNote = `横轴=销售额占比，纵轴=销售额同期环比 ｜ ${matrixThresholdDescription} ｜ 统计窗口 ${rangeLabel} ｜ 截止 ${asOfDate}`;
  const scoreDefinitionNote = `候选池：Top${scorePoolN}（按本期销售额预筛）｜ 评分：TOPSIS + P5/P95 截尾归一化 ｜ 统计窗口 ${rangeLabel} ｜ 截止 ${asOfDate}`;
  const scoreSubtitleText = `基于规模、效率、增长、风险四维得分排序（展示 Top${scoreVisibleCount}）`;
  const scoreChartHeight = resolveGoodsScoreChartHeight(isMobile, scoreVisibleCount);

  return (
    <div className={goodsDetailStyles.sectionStack}>
      {loadError ? (
        <section className={noticeStyles.overviewDataErrorNotice} role="alert" aria-live="polite">
          <strong className={noticeStyles.overviewDataErrorNoticeTitle}>商品经营数据拉取失败</strong>
          <span className={noticeStyles.overviewDataErrorNoticeText}>{loadError}</span>
          <span className={noticeStyles.overviewDataErrorNoticeText}>
            当前空表可能是接口失败，不代表业务数据为 0。请优先检查 ADS 商品日表刷新状态。
          </span>
        </section>
      ) : null}

      <DashboardChart
        title="波士顿商品矩阵"
        subtitle={matrixHeaderExtra}
        option={matrixOption}
        footerNote={matrixDefinitionNote}
        className={goodsDetailStyles.matrixPanel}
      />

      <section className={goodsDetailStyles.tablePanel}>
        <div className={tableStyles.tableHead}>
          <div className={tableStyles.tableMeta}>
            <h3 className={tableStyles.tableTitle}>商品详情</h3>
          </div>
          <div className={tableStyles.summaryMeta}>
            <span>{`本期销售额：${formatTableNumber(summary?.totalCurrGmv ?? 0, 2)}`}</span>
            <span>{`上期销售额：${formatTableNumber(summary?.totalPrevGmv ?? 0, 2)}`}</span>
            <span className={getTrendClassNameByRate(summary?.deltaRate ?? null)}>
              {`环比：${formatSignedRatePercent(summary?.deltaRate ?? null, 0)}`}
            </span>
          </div>
        </div>

        <Table<DashboardGoodsTableItem>
          rowKey={(row) => row.productId}
          className={`${tableShellStyles.goodsDataTable} ${metricsTableStyles.goodsDataTableMetrics} ${scoreRowStyles.goodsScoreDrilldownTable}`}
          columns={columns}
          dataSource={rows}
          loading={loading}
          size="small"
          scroll={{ x: isMobile ? 1660 : 1980, y: isMobile ? undefined : 540 }}
          pagination={
            isMobile
              ? {
                pageSize: 8,
                showSizeChanger: false,
              }
              : false
          }
          locale={{
            emptyText: resolveGoodsTableEmptyText(loading, loadError),
          }}
          rowClassName={(row) => {
            const rowClassNames = [tableShellStyles.goodsDataTableRow];
            if (selectedScoreDetail?.productId === row.productId) {
              rowClassNames.push(scoreRowStyles.goodsScoreDrilldownRowActive);
              return rowClassNames.join(' ');
            }
            if (row.scoreBreakdown) {
              rowClassNames.push(scoreRowStyles.goodsScoreDrilldownRow);
            }
            return rowClassNames.join(' ');
          }}
          onRow={(row) => ({
            onClick: () => {
              if (!row.scoreBreakdown) {
                return;
              }
              onScoreRowClick(row);
            },
            style: row.scoreBreakdown ? { cursor: 'pointer' } : undefined,
          })}
        />
        <div className={tableStyles.footnote}>
          <span className={tableStyles.footnoteLabel}>样本置信度说明：</span>
          <span>{GOODS_SCORE_CONFIDENCE_FOOTNOTE_TEXT}</span>
        </div>
      </section>

      <DashboardChart
        title="商品 TOPSIS 综合评分"
        subtitle={<span className={scoreStyles.scoreSubtitleText}>{scoreSubtitleText}</span>}
        option={scoreOption}
        footerNote={scoreDefinitionNote}
        className={goodsDetailStyles.scorePanel}
        headerExtra={<Tag className={scoreStyles.scoreHintTag}>点击条形或商品行查看 4 维雷达分解</Tag>}
        chartHeight={scoreChartHeight}
        onPointClick={onScoreBarClick}
      />
    </div>
  );
}
