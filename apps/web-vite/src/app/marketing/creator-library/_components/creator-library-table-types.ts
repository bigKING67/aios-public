import type { HTMLAttributes, Key } from 'react';
import type { CreatorLibraryItem, CreatorLibrarySort } from '../_lib/creator-library-types';

export interface CreatorLibraryTableProps {
  items: CreatorLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  sort: CreatorLibrarySort;
  loading?: boolean;
  selectedRowKeys: Key[];
  onSelectionChange: (keys: Key[]) => void;
  onSortChange: (sort: CreatorLibrarySort) => void;
  onPageChange: (page: number, pageSize: number) => void;
  onView: (item: CreatorLibraryItem) => void;
  onEdit: (item: CreatorLibraryItem) => void;
  onFollow: (item: CreatorLibraryItem) => void;
  onAssign: (item: CreatorLibraryItem) => void;
  onDelete: (item: CreatorLibraryItem) => void;
}

export type CreatorLibraryTableActions = Pick<
  CreatorLibraryTableProps,
  'onView' | 'onEdit' | 'onFollow' | 'onAssign' | 'onDelete'
>;

export type CreatorLibraryTableCellProps = Pick<HTMLAttributes<HTMLElement>, 'className'>;
export type CreatorLibraryCellAlign = 'center' | 'right';
export type CreatorLibraryTableSortOrder = 'ascend' | 'descend' | null | undefined;

export type CreatorLibrarySortableColumnKey =
  | 'identity'
  | 'influencerName'
  | 'platform'
  | 'fans'
  | 'tags'
  | 'anchorLevel'
  | 'sales90d'
  | 'status'
  | 'ownerName'
  | 'lastFollowedAt';
