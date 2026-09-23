import { formatAttributionSummary } from './platform-tab-attribution-summary';
import { buildAttributionTableProps } from './platform-tab-attribution-table-props';
import { buildAttributionWaterfallChartProps } from './platform-tab-attribution-waterfall-props';
import { buildFunnelTableProps } from './platform-tab-funnel-table-props';
import { buildQuantTableProps } from './platform-tab-quant-table-props';
import type {
  BuildDouyinCardProductAttributionLeafPropsInput,
  BuildDouyinCardSourceAttributionLeafPropsInput,
  BuildDouyinCardSourceFunnelLeafPropsInput,
  DouyinCardProductAttributionLeafPropsBundle,
  DouyinCardSourceAttributionLeafPropsBundle,
  DouyinCardSourceFunnelLeafPropsBundle,
} from './platform-tab-douyin-card-leaf-contracts';
import { buildDouyinFunnelChartData } from './platform-tab-douyin-funnel-chart-data';
import { formatPeriodDeltaSummary } from './platform-tab-period-delta-summary';

export function buildDouyinCardProductAttributionLeafProps({
  isMobile,
  data,
  douyinCardProductColumns,
  waterfallTotalColor,
}: BuildDouyinCardProductAttributionLeafPropsInput): DouyinCardProductAttributionLeafPropsBundle {
  const {
    douyinCardAsOfDate,
    douyinCardProductTableRows,
    douyinCardTotalCurrent,
    douyinCardTotalPrev,
    douyinCardTotalDelta,
    douyinCardProductWaterfallSteps,
  } = data;

  return {
    overviewSectionProps: {
      tableProps: buildAttributionTableProps({
        isMobile,
        rows: douyinCardProductTableRows,
        columns: douyinCardProductColumns,
        rowKey: (record) => record.rowId,
        mobileX: 960,
        desktopX: 1180,
      }),
      waterfallChartProps: buildAttributionWaterfallChartProps({
        title: '商品卡商品GMV增量瀑布（对比上周同期）',
        previousValue: douyinCardTotalPrev,
        currentValue: douyinCardTotalCurrent,
        steps: douyinCardProductWaterfallSteps,
        totalColor: waterfallTotalColor,
      }),
    },
    summaryText: formatAttributionSummary({
      asOfDate: douyinCardAsOfDate,
      previousValue: douyinCardTotalPrev,
      currentValue: douyinCardTotalCurrent,
      deltaValue: douyinCardTotalDelta,
    }),
  };
}

export function buildDouyinCardSourceAttributionLeafProps({
  isMobile,
  data,
  douyinCardSourceColumns,
  waterfallTotalColor,
}: BuildDouyinCardSourceAttributionLeafPropsInput): DouyinCardSourceAttributionLeafPropsBundle {
  const {
    diagnosisCardProductId,
    diagnosisCardProductName,
    douyinCardSourceTableRows,
    douyinCardSourceTotalCurrent,
    douyinCardSourceTotalPrev,
    douyinCardSourceTotalDelta,
    douyinCardSourceWaterfallSteps,
  } = data;

  return {
    sourceDescription: diagnosisCardProductId
      ? `聚焦商品 ${diagnosisCardProductName || diagnosisCardProductId}（${diagnosisCardProductId}）拆解 12 个一级来源渠道。`
      : '按一级来源渠道拆解商品卡 GMV 波动。',
    overviewSectionProps: {
      tableProps: buildAttributionTableProps({
        isMobile,
        rows: douyinCardSourceTableRows,
        columns: douyinCardSourceColumns,
        rowKey: (record) => record.rowId,
        mobileX: 920,
        desktopX: 1160,
      }),
      waterfallChartProps: buildAttributionWaterfallChartProps({
        title: '商品卡来源渠道GMV增量瀑布（对比上周同期）',
        previousValue: douyinCardSourceTotalPrev,
        currentValue: douyinCardSourceTotalCurrent,
        steps: douyinCardSourceWaterfallSteps,
        totalColor: waterfallTotalColor,
      }),
    },
    summaryText: formatPeriodDeltaSummary({
      prefix: '渠道小结',
      previousValue: douyinCardSourceTotalPrev,
      currentValue: douyinCardSourceTotalCurrent,
      deltaValue: douyinCardSourceTotalDelta,
    }),
  };
}

export function buildDouyinCardSourceFunnelLeafProps({
  isMobile,
  data,
  douyinLiveDetailColumns,
  quantColumns,
  resolveFunnelStageColor,
}: BuildDouyinCardSourceFunnelLeafPropsInput): DouyinCardSourceFunnelLeafPropsBundle {
  const {
    selectedDouyinCardSource,
    selectedDouyinCardSourceStages,
    selectedDouyinCardQuantRows,
    selectedDouyinCardDetailRows,
  } = data;

  if (!selectedDouyinCardSource) {
    return {
      selectedSourceLevelText: '--',
      overviewSectionProps: null,
      quantSectionProps: null,
    };
  }

  return {
    selectedSourceLevelText: selectedDouyinCardSource.sourceLevel1 || '--',
    overviewSectionProps: {
      funnelData: buildDouyinFunnelChartData(
        selectedDouyinCardSourceStages,
        resolveFunnelStageColor
      ),
      tableProps: buildFunnelTableProps({
        isMobile,
        rows: selectedDouyinCardDetailRows,
        columns: douyinLiveDetailColumns,
        rowKey: (record) => record.key,
        pagination: false,
        mobileX: 680,
        desktopX: 740,
        desktopY: 360,
      }),
    },
    quantSectionProps: {
      tableProps: buildQuantTableProps({
        isMobile,
        rows: selectedDouyinCardQuantRows,
        columns: quantColumns,
        rowKey: (record) => `card-${record.rowId}`,
      }),
    },
  };
}
