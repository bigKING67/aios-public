import { Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { GOODS_SCORE_CONFIDENCE_TOOLTIP_TEXT } from './dashboard-config';
import {
  formatSignedRatePercent,
  formatTableInteger,
  formatTableNumber,
  formatTableRate,
} from './dashboard-formatters';
import type { DashboardGoodsScoreClassNames } from './dashboard-goods-score-model';
import {
  getGoodsScoreConfidenceClassName,
  getGoodsScoreConfidenceLabel,
  getTrendClassNameByRate,
} from './dashboard-goods-score-model';
import { compareNullableNumbers, compareText } from './dashboard-sorters';
import type { DashboardGoodsTableItem } from './dashboard-types';

export interface DashboardGoodsTableClassNames extends DashboardGoodsScoreClassNames {
  goodsDataShellHeaderCell: string;
  goodsDataShellBodyCell: string;
  goodsDataHeaderCell: string;
  goodsDataMetricHeaderCell: string;
  goodsDataBodyCell: string;
  goodsMetricCell: string;
  goodsMetricValue: string;
  goodsMetricMeta: string;
  goodsMetricTrend: string;
  goodsNameCell: string;
  goodsNameText: string;
  goodsIdText: string;
  goodsScoreHeaderLabel: string;
  goodsScoreCell: string;
  goodsScoreValue: string;
  goodsScoreMeta: string;
  goodsScoreConfidencePill: string;
}

function buildGoodsDataBodyCellProps(classNames: DashboardGoodsTableClassNames) {
  return {
    className: `${classNames.goodsDataShellBodyCell} ${classNames.goodsDataBodyCell}`,
  };
}

function buildGoodsDataHeaderCellProps(classNames: DashboardGoodsTableClassNames) {
  return { className: `${classNames.goodsDataShellHeaderCell} ${classNames.goodsDataHeaderCell}` };
}

function buildGoodsDataMetricHeaderCellProps(classNames: DashboardGoodsTableClassNames) {
  return {
    className: `${classNames.goodsDataShellHeaderCell} ${classNames.goodsDataHeaderCell} ${classNames.goodsDataMetricHeaderCell}`,
  };
}

export function buildDashboardGoodsColumns({
  isMobile,
  classNames,
}: {
  isMobile: boolean;
  classNames: DashboardGoodsTableClassNames;
}): ColumnsType<DashboardGoodsTableItem> {
  const headerCellProps = () => buildGoodsDataHeaderCellProps(classNames);
  const metricHeaderCellProps = () => buildGoodsDataMetricHeaderCellProps(classNames);
  const bodyCellProps = () => buildGoodsDataBodyCellProps(classNames);

  const renderGoodsMetricCell = (valueText: string, wow: number | null | undefined) => (
    <div className={classNames.goodsMetricCell}>
      <div className={classNames.goodsMetricValue}>{valueText}</div>
      <div className={classNames.goodsMetricMeta}>
        <span>同期环比</span>
        <span className={`${classNames.goodsMetricTrend} ${getTrendClassNameByRate(wow, classNames)}`}>
          {formatSignedRatePercent(wow, 0)}
        </span>
      </div>
    </div>
  );

  return [
    {
      title: '商品名称',
      dataIndex: 'productName',
      key: 'productName',
      width: isMobile ? 340 : 460,
      fixed: isMobile ? undefined : 'left',
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareText(left.productName, right.productName),
      render: (_value: string, row) => (
        <div className={classNames.goodsNameCell}>
          <div className={classNames.goodsNameText} title={row.productName}>
            {row.productName}
          </div>
        </div>
      ),
    },
    {
      title: '商品ID',
      dataIndex: 'productId',
      key: 'productId',
      width: isMobile ? 132 : 146,
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareText(left.productId, right.productId),
      render: (value: string) => (
        <div className={classNames.goodsIdText} title={value}>
          {value}
        </div>
      ),
    },
    {
      title: (
        <Tooltip title={GOODS_SCORE_CONFIDENCE_TOOLTIP_TEXT} placement="top">
          <span className={classNames.goodsScoreHeaderLabel}>综合分</span>
        </Tooltip>
      ),
      dataIndex: 'topsisScore',
      key: 'topsisScore',
      width: isMobile ? 162 : 188,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: metricHeaderCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.topsisScore, right.topsisScore),
      render: (value: number | null, row) => {
        const scoreText = value === null || value === undefined ? '--' : value.toFixed(1);
        const rankText = row.topsisRank === null || row.topsisRank === undefined ? '--' : `#${row.topsisRank}`;
        return (
          <div className={classNames.goodsScoreCell}>
            <div className={classNames.goodsScoreValue}>{scoreText}</div>
            <div className={classNames.goodsScoreMeta}>
              <span>{rankText}</span>
              <span
                className={`${classNames.goodsScoreConfidencePill} ${getGoodsScoreConfidenceClassName(
                  row.scoreConfidence,
                  classNames
                )}`}
              >
                {getGoodsScoreConfidenceLabel(row.scoreConfidence)}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: '商品GMV',
      dataIndex: 'currGmv',
      key: 'currGmv',
      width: isMobile ? 142 : 156,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: metricHeaderCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => left.currGmv - right.currGmv,
      render: (value: number, row) => renderGoodsMetricCell(`¥${formatTableNumber(value, 2)}`, row.gmvWow),
    },
    {
      title: '商品GSV',
      dataIndex: 'currGsv',
      key: 'currGsv',
      width: isMobile ? 154 : 180,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: metricHeaderCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => left.currGsv - right.currGsv,
      render: (value: number, row) => renderGoodsMetricCell(`¥${formatTableNumber(value, 2)}`, row.gsvWow),
    },
    {
      title: '成交人数',
      dataIndex: 'payBuyerCount',
      key: 'payBuyerCount',
      width: isMobile ? 136 : 160,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: metricHeaderCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => left.payBuyerCount - right.payBuyerCount,
      render: (value: number, row) => renderGoodsMetricCell(formatTableInteger(value), row.payBuyerWow),
    },
    {
      title: '访客',
      dataIndex: 'visitorCount',
      key: 'visitorCount',
      width: isMobile ? 136 : 160,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: metricHeaderCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => left.visitorCount - right.visitorCount,
      render: (value: number, row) => renderGoodsMetricCell(formatTableInteger(value), row.visitorWow),
    },
    {
      title: '成交转化率',
      dataIndex: 'payConversionRate',
      key: 'payConversionRate',
      width: isMobile ? 146 : 170,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: metricHeaderCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.payConversionRate, right.payConversionRate),
      render: (value: number | null, row) =>
        renderGoodsMetricCell(formatTableRate(value), row.payConversionRateWow),
    },
    {
      title: '客单价',
      dataIndex: 'avgOrderValue',
      key: 'avgOrderValue',
      width: isMobile ? 146 : 170,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: metricHeaderCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => compareNullableNumbers(left.avgOrderValue, right.avgOrderValue),
      render: (value: number | null, row) => {
        const valueText = value === null || value === undefined ? '--' : `¥${formatTableNumber(value, 2)}`;
        return renderGoodsMetricCell(valueText, row.avgOrderValueWow);
      },
    },
    {
      title: '退款金额',
      dataIndex: 'refundAmount',
      key: 'refundAmount',
      width: isMobile ? 154 : 180,
      align: isMobile ? 'left' : 'right',
      onHeaderCell: metricHeaderCellProps,
      onCell: bodyCellProps,
      sorter: (left, right) => left.refundAmount - right.refundAmount,
      render: (value: number, row) => renderGoodsMetricCell(`¥${formatTableNumber(value, 2)}`, row.refundWow),
    },
  ];
}
