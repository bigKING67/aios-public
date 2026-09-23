import { formatAttributionSummary } from './platform-tab-attribution-summary';
import { buildAttributionTableProps } from './platform-tab-attribution-table-props';
import { buildAttributionWaterfallChartProps } from './platform-tab-attribution-waterfall-props';
import type {
  BuildDouyinShortvideoAnalysisLeafPropsInput,
  BuildDouyinShortvideoOverviewLeafPropsInput,
  DouyinShortvideoAnalysisLeafPropsBundle,
  DouyinShortvideoOverviewLeafPropsBundle,
} from './platform-tab-douyin-shortvideo-leaf-contracts';
import {
  resolveResponsiveTableScroll,
  resolveResponsiveTableSize,
} from './platform-tab-table-responsive';

export function buildDouyinShortvideoOverviewLeafProps({
  isMobile,
  data,
  douyinShortvideoColumns,
  waterfallTotalColor,
}: BuildDouyinShortvideoOverviewLeafPropsInput): DouyinShortvideoOverviewLeafPropsBundle {
  const {
    douyinShortvideoAsOfDate,
    douyinShortvideoTableRows,
    douyinShortvideoTotalCurrent,
    douyinShortvideoTotalPrev,
    douyinShortvideoTotalDelta,
    douyinShortvideoWaterfallSteps,
  } = data;

  return {
    overviewSectionProps: {
      tableProps: buildAttributionTableProps({
        isMobile,
        rows: douyinShortvideoTableRows,
        columns: douyinShortvideoColumns,
        rowKey: (record) => record.rowId,
        mobileX: 980,
        desktopX: 1320,
      }),
      waterfallChartProps: buildAttributionWaterfallChartProps({
        title: '短视频GMV增量瀑布（对比上周同期）',
        previousValue: douyinShortvideoTotalPrev,
        currentValue: douyinShortvideoTotalCurrent,
        steps: douyinShortvideoWaterfallSteps,
        totalColor: waterfallTotalColor,
      }),
    },
    summaryText: formatAttributionSummary({
      asOfDate: douyinShortvideoAsOfDate,
      previousValue: douyinShortvideoTotalPrev,
      currentValue: douyinShortvideoTotalCurrent,
      deltaValue: douyinShortvideoTotalDelta,
    }),
  };
}

export function buildDouyinShortvideoAnalysisLeafProps({
  isMobile,
  data,
  douyinShortvideoColumns,
}: BuildDouyinShortvideoAnalysisLeafPropsInput): DouyinShortvideoAnalysisLeafPropsBundle {
  const {
    selectedDouyinShortvideoRow,
    selectedDouyinShortvideoDiagnosis,
  } = data;

  if (!selectedDouyinShortvideoRow) {
    return {
      selectedAuthorNickname: '--',
      diagnosisCardProps: null,
      tableProps: null,
    };
  }

  return {
    selectedAuthorNickname: selectedDouyinShortvideoRow.authorNickname || '--',
    diagnosisCardProps: {
      title: '原因与动作建议',
      items: selectedDouyinShortvideoDiagnosis.map((item, index) => ({
        key: `${selectedDouyinShortvideoRow.rowId}-diagnosis-${index}`,
        reason: item.reason,
        action: item.action,
      })),
    },
    tableProps: {
      rowKey: (record) => record.rowId,
      dataSource: [selectedDouyinShortvideoRow],
      columns: douyinShortvideoColumns,
      size: resolveResponsiveTableSize(isMobile),
      pagination: false,
      scroll: resolveResponsiveTableScroll({
        isMobile,
        mobileX: 980,
        desktopX: 1320,
      }),
    },
  };
}
