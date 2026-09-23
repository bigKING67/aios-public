import { Drawer, Tag } from 'antd';
import type { EChartsCoreOption } from 'echarts/core';

import { DashboardChart } from './dashboard-chart';
import { formatSignedRatePercent, formatTableNumber } from './dashboard-formatters';
import {
  getGoodsScoreConfidenceClassName as resolveGoodsScoreConfidenceClassName,
  getGoodsScoreConfidenceLabel,
  getTrendClassNameByRate as resolveTrendClassNameByRate,
} from './dashboard-goods-score-model';
import hintStyles from './dashboard-drawer-hint.module.css';
import drawerStyles from './dashboard-goods-score-drawer.module.css';
import goodsTableStyles from './dashboard-goods-table.module.css';
import trendStyles from './dashboard-trend-status.module.css';
import type { DashboardGoodsScoreDetailItem } from './dashboard-types';

const GOODS_SCORE_DRAWER_CLASS_NAMES = {
  trendUp: trendStyles.trendUp,
  trendDown: trendStyles.trendDown,
  trendNeutral: trendStyles.trendNeutral,
  goodsScoreConfidenceHigh: goodsTableStyles.confidenceHigh,
  goodsScoreConfidenceMedium: goodsTableStyles.confidenceMedium,
  goodsScoreConfidenceLow: goodsTableStyles.confidenceLow,
};

function getTrendClassNameByRate(value: number | null | undefined): string {
  return resolveTrendClassNameByRate(value, GOODS_SCORE_DRAWER_CLASS_NAMES);
}

function getGoodsScoreConfidenceClassName(
  value: DashboardGoodsScoreDetailItem['scoreConfidence']
): string {
  return resolveGoodsScoreConfidenceClassName(value, GOODS_SCORE_DRAWER_CLASS_NAMES);
}

export type DashboardGoodsScoreDrawerProps = {
  open: boolean;
  isMobile: boolean;
  selectedDetail: DashboardGoodsScoreDetailItem | null;
  radarOption: EChartsCoreOption;
  onClose: () => void;
};

export function DashboardGoodsScoreDrawer({
  open,
  isMobile,
  selectedDetail,
  radarOption,
  onClose,
}: DashboardGoodsScoreDrawerProps) {
  return (
    <Drawer
      title="商品评分分解"
      placement="right"
      size={isMobile ? 'large' : 'default'}
      closable={{ placement: 'end' }}
      open={open}
      onClose={onClose}
    >
      {selectedDetail ? (
        <div className={drawerStyles.content}>
          <h4 className={drawerStyles.productName} title={selectedDetail.productName}>
            {selectedDetail.productName}
          </h4>
          <div className={drawerStyles.meta}>
            <Tag color="blue">{`综合分 ${
              selectedDetail.topsisScore === null ? '--' : selectedDetail.topsisScore.toFixed(1)
            } / 10`}</Tag>
            <Tag>{`排名 ${selectedDetail.topsisRank ?? '--'}`}</Tag>
            <Tag
              className={`${goodsTableStyles.confidencePill} ${getGoodsScoreConfidenceClassName(
                selectedDetail.scoreConfidence
              )}`}
            >
              {getGoodsScoreConfidenceLabel(selectedDetail.scoreConfidence)}
            </Tag>
          </div>
          <div className={drawerStyles.info}>
            <span>{`商品ID：${selectedDetail.productId}`}</span>
            <span>{`本期销售额：¥${formatTableNumber(selectedDetail.currGmv, 2)}`}</span>
            <span className={getTrendClassNameByRate(selectedDetail.gmvWow)}>
              {`GMV同期环比：${formatSignedRatePercent(selectedDetail.gmvWow, 1)}`}
            </span>
          </div>
          <DashboardChart
            title="TOPSIS 四维分解雷达"
            subtitle="规模 / 效率 / 增长 / 风险（满分 10）"
            option={radarOption}
            className={drawerStyles.radarPanel}
            chartHeight={isMobile ? 280 : 320}
          />
        </div>
      ) : (
        <p className={hintStyles.hint}>点击评分条形图或商品行，查看 4 维雷达分解。</p>
      )}
    </Drawer>
  );
}
