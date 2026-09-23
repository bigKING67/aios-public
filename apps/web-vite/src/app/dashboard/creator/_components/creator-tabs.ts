export type CreatorDashboardTabKey = 'live' | 'short-video' | 'target-list';

export const CREATOR_DASHBOARD_TABS: ReadonlyArray<{
  key: CreatorDashboardTabKey;
  label: string;
  href: string;
}> = [
  { key: 'live', label: '直播带货达人', href: '/dashboard/creator/live' },
  { key: 'short-video', label: '短视频挂车达人', href: '/dashboard/creator/short-video' },
];
