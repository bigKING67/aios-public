import { Pagination } from '@lobehub/ui';

export interface AdminMobilePaginationProps {
  current: number;
  pageSize: number;
  total: number;
  /** Called for page and page-size changes alike (lobe Pagination reports both through it). */
  onChange: (page: number, pageSize: number) => void;
  onPageSizeChange?: (page: number, pageSize: number) => void;
}

/** Pager under the admin mobile record lists. */
export function AdminMobilePagination({ current, pageSize, total, onChange, onPageSizeChange }: AdminMobilePaginationProps) {
  return (
    <Pagination
      size="small"
      current={current}
      pageSize={pageSize}
      total={total}
      showSizeChanger
      showTotal={(totalCount) => `共 ${totalCount} 条`}
      onChange={onChange}
      onPageSizeChange={onPageSizeChange}
      hideOnSinglePage
    />
  );
}
