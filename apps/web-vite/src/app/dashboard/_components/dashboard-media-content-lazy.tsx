import { useDashboardMediaContents } from './dashboard-media-content';
import type { DashboardDimensionContentKind } from './dashboard-dimension-content';
import type { DashboardMediaContentsArgs } from './dashboard-media-content-types';
import { DASHBOARD_MEDIA_VIEW_CLASS_NAMES } from './dashboard-media-view-class-names';

export type DashboardMediaContentLazyProps = Omit<
  DashboardMediaContentsArgs,
  | 'getTrendClassNameByRate'
  | 'liveChartClassNames'
  | 'liveDetailTableClassNames'
  | 'shortVideoDetailTableClassNames'
> & {
  contentKind: Extract<DashboardDimensionContentKind, 'live' | 'shortVideo'>;
};

export default function DashboardMediaContentLazy({
  contentKind,
  ...args
}: DashboardMediaContentLazyProps) {
  const { liveContent, shortVideoContent } = useDashboardMediaContents({
    ...args,
    getTrendClassNameByRate: DASHBOARD_MEDIA_VIEW_CLASS_NAMES.getTrendClassNameByRate,
    liveChartClassNames: DASHBOARD_MEDIA_VIEW_CLASS_NAMES.liveChartClassNames,
    liveDetailTableClassNames: DASHBOARD_MEDIA_VIEW_CLASS_NAMES.liveDetailTableClassNames,
    shortVideoDetailTableClassNames: DASHBOARD_MEDIA_VIEW_CLASS_NAMES.shortVideoDetailTableClassNames,
  });

  return <>{contentKind === 'live' ? liveContent : shortVideoContent}</>;
}
