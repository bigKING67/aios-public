import {
  pickDouyinPlatformColumns,
  pickTmallPlatformColumns,
} from './platform-tab-content-columns';
import type { PlatformTabContentProps } from './platform-tab-content-props';
import { buildDouyinAttributionSectionsProps } from './platform-tab-douyin-section-adapter';
import type {
  DouyinAttributionSectionPropsBundle,
} from './platform-tab-douyin-attribution-section-contracts';
import { buildTmallAttributionSectionProps } from './platform-tab-tmall-attribution-section-adapter';
import type { TmallPlatformContentProps } from './platform-tab-tmall-content-contracts';
import { buildPlatformTrendSectionProps } from './platform-tab-trend-section-adapter';
import type {
  PlatformTrendSectionPropsBundle,
} from './platform-tab-trend-section-contracts';

export function buildTmallPlatformContentProps({
  isMobile,
  report,
  platformLabel,
  summaryWeekPeriod,
  columns,
  viewModel,
}: PlatformTabContentProps): TmallPlatformContentProps {
  const tmallColumns = pickTmallPlatformColumns(columns);

  return {
    summaryCardProps: {
      reportId: report.meta?.report_id || 'latest',
      weekPeriod: summaryWeekPeriod,
      summaryLabel: `${platformLabel}总结`,
      summaryScope: 'tmall',
    },
    attributionSectionProps: buildTmallAttributionSectionProps({
      isMobile,
      columns: tmallColumns,
      viewModel,
    }),
  };
}

export function buildDouyinPlatformContentProps({
  isMobile,
  columns,
  viewModel,
}: PlatformTabContentProps): DouyinAttributionSectionPropsBundle {
  return buildDouyinAttributionSectionsProps({
    isMobile,
    columns: pickDouyinPlatformColumns(columns),
    viewModel,
  });
}

export function buildTrendPlatformContentProps({
  platformLabel,
  viewModel,
}: PlatformTabContentProps): PlatformTrendSectionPropsBundle {
  return buildPlatformTrendSectionProps({
    platformLabel,
    viewModel,
  });
}
