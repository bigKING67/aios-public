import { formatAttributionSummary } from './platform-tab-attribution-summary';
import { buildAttributionTableProps } from './platform-tab-attribution-table-props';
import { buildAttributionWaterfallChartProps } from './platform-tab-attribution-waterfall-props';
import { buildFunnelTableProps } from './platform-tab-funnel-table-props';
import { buildQuantTableProps } from './platform-tab-quant-table-props';
import type {
  BuildDouyinLiveFunnelAttributionLeafPropsInput,
  BuildDouyinLiveSessionAttributionLeafPropsInput,
  DouyinLiveFunnelAttributionLeafPropsBundle,
  DouyinLiveSessionAttributionLeafPropsBundle,
} from './platform-tab-douyin-live-leaf-contracts';
import { buildDouyinFunnelChartData } from './platform-tab-douyin-funnel-chart-data';
import { formatPeriodDeltaSummary } from './platform-tab-period-delta-summary';

export function buildDouyinLiveSessionAttributionLeafProps({
  isMobile,
  data,
  douyinLiveColumns,
  waterfallTotalColor,
}: BuildDouyinLiveSessionAttributionLeafPropsInput): DouyinLiveSessionAttributionLeafPropsBundle {
  const {
    douyinLiveAsOfDate,
    douyinLiveTableRows,
    douyinLiveTotalCurrent,
    douyinLiveTotalPrev,
    douyinLiveTotalDelta,
    douyinLiveWaterfallSteps,
  } = data;

  return {
    overviewSectionProps: {
      tableProps: buildAttributionTableProps({
        isMobile,
        rows: douyinLiveTableRows,
        columns: douyinLiveColumns,
        rowKey: (record) => record.rowId,
        mobileX: 980,
        desktopX: 1280,
      }),
      waterfallChartProps: buildAttributionWaterfallChartProps({
        title: '直播GMV增量瀑布（对比上周同期）',
        previousValue: douyinLiveTotalPrev,
        currentValue: douyinLiveTotalCurrent,
        steps: douyinLiveWaterfallSteps,
        totalColor: waterfallTotalColor,
      }),
    },
    summaryText: formatAttributionSummary({
      asOfDate: douyinLiveAsOfDate,
      previousValue: douyinLiveTotalPrev,
      currentValue: douyinLiveTotalCurrent,
      deltaValue: douyinLiveTotalDelta,
    }),
  };
}

export function buildDouyinLiveFunnelAttributionLeafProps({
  isMobile,
  data,
  douyinLiveDetailColumns,
  quantColumns,
  resolveFunnelStageColor,
}: BuildDouyinLiveFunnelAttributionLeafPropsInput): DouyinLiveFunnelAttributionLeafPropsBundle {
  const {
    selectedDouyinLiveRow,
    selectedDouyinLiveStages,
    selectedDouyinLiveDetailRows,
    selectedDouyinLiveQuantRows,
  } = data;

  if (!selectedDouyinLiveRow) {
    return {
      selectedAnchorNickname: '--',
      overviewSectionProps: null,
      quantSectionProps: null,
    };
  }

  return {
    selectedAnchorNickname: selectedDouyinLiveRow.anchorNickname || '--',
    overviewSectionProps: {
      funnelData: buildDouyinFunnelChartData(
        selectedDouyinLiveStages,
        resolveFunnelStageColor
      ),
      tableProps: buildFunnelTableProps({
        isMobile,
        rows: selectedDouyinLiveDetailRows,
        columns: douyinLiveDetailColumns,
        rowKey: (record) => record.key,
        pagination: false,
        mobileX: 680,
        desktopX: 740,
        desktopY: 360,
      }),
      summaryText: formatPeriodDeltaSummary({
        prefix: '场次小结',
        previousValue: selectedDouyinLiveRow.prevLiveGmv,
        currentValue: selectedDouyinLiveRow.currLiveGmv,
        deltaValue: selectedDouyinLiveRow.liveGmvDelta,
      }),
    },
    quantSectionProps: {
      tableProps: buildQuantTableProps({
        isMobile,
        rows: selectedDouyinLiveQuantRows,
        columns: quantColumns,
        rowKey: (record) => record.rowId,
      }),
    },
  };
}
