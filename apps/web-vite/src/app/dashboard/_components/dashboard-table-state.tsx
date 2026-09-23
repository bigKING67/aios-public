import { Empty } from 'antd';

export type DashboardDetailTablePaginationArgs = {
  isMobile: boolean;
  mobilePageSize: number;
  desktopPageSize?: number;
  current?: number;
  pageSize?: number;
  onChange?: (page: number, pageSize: number) => void;
};

export type DashboardTableEmptyContentArgs = {
  isLoading: boolean;
  hasLoadError: boolean;
  loadingText: string;
  errorText: string;
  emptyDescription: string;
};

function buildPageSizeOptions(desktopPageSize: number): string[] {
  return Array.from(new Set([desktopPageSize, 20, 50, 100]))
    .sort((left, right) => left - right)
    .map(String);
}

export function buildDashboardDetailTablePagination({
  isMobile,
  mobilePageSize,
  desktopPageSize = 20,
  current,
  pageSize,
  onChange,
}: DashboardDetailTablePaginationArgs) {
  const resolvedPageSize = pageSize ?? (isMobile ? mobilePageSize : desktopPageSize);
  const pageState =
    pageSize === undefined
      ? { defaultPageSize: resolvedPageSize }
      : {
          current: current ?? 1,
          pageSize: resolvedPageSize,
        };

  return {
    ...pageState,
    showSizeChanger: isMobile ? false : { showSearch: false },
    pageSizeOptions: buildPageSizeOptions(desktopPageSize),
    onChange,
    onShowSizeChange: onChange,
    showTotal: (total: number) => `共 ${total} 条`,
  };
}

export function buildDashboardTableEmptyContent({
  isLoading,
  hasLoadError,
  loadingText,
  errorText,
  emptyDescription,
}: DashboardTableEmptyContentArgs) {
  if (isLoading) {
    return loadingText;
  }
  if (hasLoadError) {
    return errorText;
  }
  return <Empty description={emptyDescription} />;
}
