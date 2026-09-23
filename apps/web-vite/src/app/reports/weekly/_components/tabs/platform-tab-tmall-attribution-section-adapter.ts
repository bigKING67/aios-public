import {
  buildTmallFunnelDiagnosisSectionListProps,
} from './platform-tab-tmall-funnel-section-list-adapter';
import type {
  BuildTmallAttributionSectionPropsParams,
  TmallAttributionSectionPropsBundle,
} from './platform-tab-tmall-attribution-section-contracts';
import {
  WATERFALL_TOTAL_COLOR,
  getFunnelStageColor,
} from './platform-tab-chart-visuals';
import {
  buildTmallChannelAttributionLeafProps,
  buildTmallGoodsAttributionLeafProps,
} from './platform-tab-tmall-leaf-adapter';

export function buildTmallAttributionSectionProps({
  isMobile,
  columns,
  viewModel,
}: BuildTmallAttributionSectionPropsParams): TmallAttributionSectionPropsBundle {
  const { attributionAsOfDate, channelAttributionAsOfDate } = viewModel.attributionSources;
  const {
    goodsTableRows,
    goodsWaterfallSteps,
    channelTableRows,
    channelWaterfallSteps,
    funnelChannelSections,
    quantRows,
    quantRowsByChannel,
    tmallAttributionTotals,
  } = viewModel.tmallSectionData;

  return {
    goodsSectionProps: {
      ...buildTmallGoodsAttributionLeafProps({
        isMobile,
        goodsTableRows,
        goodsColumns: columns.goodsColumns,
        goodsWaterfallSteps,
        attributionAsOfDate,
        attributionTotalPrevGmv: tmallAttributionTotals.attributionTotalPrevGmv,
        attributionTotalGmv: tmallAttributionTotals.attributionTotalGmv,
        attributionDelta: tmallAttributionTotals.attributionDelta,
        waterfallTotalColor: WATERFALL_TOTAL_COLOR,
      }),
    },
    channelSectionProps: {
      ...buildTmallChannelAttributionLeafProps({
        isMobile,
        channelTableRows,
        channelColumns: columns.channelColumns,
        channelWaterfallSteps,
        channelAttributionAsOfDate,
        channelAttributionTotalPrevPayAmount:
          tmallAttributionTotals.channelAttributionTotalPrevPayAmount,
        channelAttributionTotalPayAmount: tmallAttributionTotals.channelAttributionTotalPayAmount,
        channelAttributionDelta: tmallAttributionTotals.channelAttributionDelta,
        waterfallTotalColor: WATERFALL_TOTAL_COLOR,
      }),
    },
    funnelSectionProps: buildTmallFunnelDiagnosisSectionListProps({
      isMobile,
      funnelChannelSections,
      quantRows,
      quantRowsByChannel,
      quantColumns: columns.quantColumns,
      funnelDetailColumnsWithClickStage: columns.funnelDetailColumnsWithClickStage,
      funnelDetailColumnsWithoutClickStage: columns.funnelDetailColumnsWithoutClickStage,
      resolveFunnelStageColor: getFunnelStageColor,
    }),
  };
}
