import { buildChannelQuantRows } from './platform-tab-channel-quant';
import { getQuantFormulaText } from './platform-tab-diagnostics';
import {
  formatInteger,
  formatRatioPercent,
} from './platform-tab-formatters';
import { formatPeriodDeltaSummary } from './platform-tab-period-delta-summary';
import { buildFunnelTableProps } from './platform-tab-funnel-table-props';
import { buildQuantTableProps } from './platform-tab-quant-table-props';
import {
  resolveResponsiveTablePagination,
} from './platform-tab-table-responsive';
import type {
  BuildTmallFunnelChannelLeafPropsParams,
  TmallFunnelChannelLeafPropsBundle,
} from './platform-tab-tmall-funnel-leaf-contracts';

export function buildTmallFunnelChannelLeafProps({
  isMobile,
  channelSection,
  quantRows,
  quantRowsByChannel,
  quantColumns,
  funnelDetailColumnsWithClickStage,
  funnelDetailColumnsWithoutClickStage,
  resolveFunnelStageColor,
}: BuildTmallFunnelChannelLeafPropsParams): TmallFunnelChannelLeafPropsBundle {
  const channelPayAmountDelta = channelSection.currPayAmount - channelSection.prevPayAmount;
  const channelHasClickStage = channelSection.rows.some((item) => item.hasClickStage);
  const channelDetailColumns = channelHasClickStage
    ? funnelDetailColumnsWithClickStage
    : funnelDetailColumnsWithoutClickStage;
  const channelDetailScrollX = channelHasClickStage ? 1860 : 1260;
  const channelLabel =
    channelSection.rows[0]?.trafficChannelLabel || channelSection.summaryText;
  const backendChannelQuantRows = quantRowsByChannel.get(channelSection.channelKey) || [];
  const channelQuantRows = backendChannelQuantRows.length > 0
    ? backendChannelQuantRows
    : buildChannelQuantRows(
        quantRows,
        channelHasClickStage,
        channelSection.rows,
        {
          channelKey: channelSection.channelKey,
          channelLabel,
        }
      );
  const channelQuantFormula = getQuantFormulaText(channelHasClickStage);

  return {
    overviewSectionProps: {
      funnelData: channelSection.stages.map((stage, stageIndex) => ({
        name: stage.label,
        value: stage.value,
        prevValue: stage.prevValue,
        wow: stage.wow,
        conversionText: stage.conversionLabel
          ? `${stage.conversionLabel} ${formatRatioPercent(stage.conversionRate, 2)}`
          : undefined,
        conversionPrevText: stage.conversionLabel
          ? `上周 ${formatRatioPercent(stage.conversionPrevRate, 2)}`
          : undefined,
        conversionWoW: stage.conversionWoW,
        prevText: `上周 ${formatInteger(stage.prevValue)}`,
        color: resolveFunnelStageColor(stageIndex),
      })),
      tableProps: buildFunnelTableProps({
        isMobile,
        rows: channelSection.rows,
        columns: channelDetailColumns,
        rowKey: (record) => record.rowId,
        pagination: resolveResponsiveTablePagination({
          isMobile,
          mobilePageSize: 6,
        }),
        mobileX: channelHasClickStage ? 1240 : 980,
        desktopX: channelDetailScrollX,
        desktopY: 420,
      }),
    },
    summaryText: formatPeriodDeltaSummary({
      prefix: '渠道小结',
      previousValue: channelSection.prevPayAmount,
      currentValue: channelSection.currPayAmount,
      deltaValue: channelPayAmountDelta,
    }),
    quantSectionProps: {
      title: `量化归因（${channelQuantFormula}）`,
      tableProps: buildQuantTableProps({
        isMobile,
        rows: channelQuantRows,
        columns: quantColumns,
        rowKey: (record) => `${channelSection.channelKey}-${record.rowId}`,
      }),
    },
  };
}
