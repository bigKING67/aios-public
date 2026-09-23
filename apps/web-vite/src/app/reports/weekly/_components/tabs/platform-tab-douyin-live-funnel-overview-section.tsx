import { FunnelOverviewFrame } from './platform-tab-funnel-overview-frame';
import type {
  DouyinLiveFunnelOverviewSectionProps,
} from './platform-tab-douyin-live-leaf-contracts';
import type {
  DouyinMetricDetailRow,
} from './platform-tab-types';
import {
  WeeklyInlineSummary,
} from './weekly-primitives';

export type {
  DouyinLiveFunnelOverviewSectionProps,
} from './platform-tab-douyin-live-leaf-contracts';

export function DouyinLiveFunnelOverviewSection({
  funnelData,
  tableProps,
  summaryText,
}: DouyinLiveFunnelOverviewSectionProps) {
  return (
    <>
      <FunnelOverviewFrame<DouyinMetricDetailRow>
        badge="五维四率漏斗"
        funnelData={funnelData}
        tableProps={tableProps}
      />

      <WeeklyInlineSummary>
        {summaryText}
      </WeeklyInlineSummary>
    </>
  );
}
