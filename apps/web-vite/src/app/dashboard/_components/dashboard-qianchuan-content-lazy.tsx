import { DashboardQianchuanContent } from './dashboard-qianchuan-content';
import type { DashboardQianchuanContentProps } from './dashboard-qianchuan-content';
import { DASHBOARD_MEDIA_VIEW_CLASS_NAMES } from './dashboard-media-view-class-names';

export type DashboardQianchuanContentLazyProps = Omit<
  DashboardQianchuanContentProps,
  'tableClassNames'
>;

export default function DashboardQianchuanContentLazy(props: DashboardQianchuanContentLazyProps) {
  return (
    <DashboardQianchuanContent
      {...props}
      tableClassNames={{
        qianchuanHeaderCell: DASHBOARD_MEDIA_VIEW_CLASS_NAMES.liveDetailTableClassNames.liveDetailHeaderCell,
        qianchuanBodyCell: DASHBOARD_MEDIA_VIEW_CLASS_NAMES.liveDetailTableClassNames.liveDetailBodyCell,
      }}
    />
  );
}
