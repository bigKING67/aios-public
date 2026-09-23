export const DASHBOARD_EXPORT_LOGIN_REQUIRED_MESSAGE = '未登录状态仅支持浏览，登录后可导出明细。';
export const DASHBOARD_EXPORT_EMPTY_OVERVIEW_DETAIL_MESSAGE = '当前筛选条件下没有可导出的明细数据。';
export const DASHBOARD_EXPORT_EMPTY_LIVE_DETAIL_MESSAGE = '当前筛选条件下没有可导出的直播明细。';
export const DASHBOARD_EXPORT_EMPTY_LIVE_GOODS_DETAIL_MESSAGE = '当前筛选条件下没有可导出的直播商品明细。';
export const DASHBOARD_EXPORT_EMPTY_SHORT_VIDEO_DETAIL_MESSAGE = '当前筛选条件下没有可导出的短视频明细。';
export const DASHBOARD_EXPORT_EMPTY_QIANCHUAN_MATERIAL_TYPE_MIX_DETAIL_MESSAGE =
  '当前筛选条件下没有可导出的千川内容类型对比明细。';
export const DASHBOARD_EXPORT_EMPTY_QIANCHUAN_VIDEO_DETAIL_MESSAGE = '当前筛选条件下没有可导出的千川视频明细。';
export const DASHBOARD_EXPORT_EMPTY_QIANCHUAN_LIVE_ROOM_SCREEN_DETAIL_MESSAGE =
  '当前筛选条件下没有可导出的千川直播间画面明细。';

export type DashboardDetailExportDisabledArgs = {
  isAuthenticated: boolean;
  isLoading: boolean;
  rowCount: number;
};

export function isDashboardDetailExportDisabled({
  isAuthenticated,
  isLoading,
  rowCount,
}: DashboardDetailExportDisabledArgs): boolean {
  return !isAuthenticated || isLoading || rowCount === 0;
}

export function downloadDashboardCsvFile(csvText: string, fileName: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function buildDashboardExportSuccessMessage(rowCount: number, detailLabel: string, fileName: string): string {
  return `已导出 ${rowCount} 条${detailLabel}到 ${fileName}`;
}
