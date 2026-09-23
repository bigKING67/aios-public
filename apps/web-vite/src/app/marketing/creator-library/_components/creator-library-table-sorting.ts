import type { Key } from 'react';
import type { CreatorLibrarySort } from '../_lib/creator-library-types';
import type {
  CreatorLibrarySortableColumnKey,
  CreatorLibraryTableSortOrder,
} from './creator-library-table-types';

const TABLE_SORT_MAP: Record<
  CreatorLibrarySortableColumnKey,
  { ascend: CreatorLibrarySort; descend: CreatorLibrarySort }
> = {
  identity: { ascend: 'identity_asc', descend: 'identity_desc' },
  influencerName: { ascend: 'name_asc', descend: 'name_desc' },
  platform: { ascend: 'platform_asc', descend: 'platform_desc' },
  fans: { ascend: 'fans_asc', descend: 'fans_desc' },
  tags: { ascend: 'anchor_tag_asc', descend: 'anchor_tag_desc' },
  anchorLevel: { ascend: 'anchor_level_asc', descend: 'anchor_level_desc' },
  sales90d: { ascend: 'sales_90d_asc', descend: 'sales_90d_desc' },
  status: { ascend: 'status_asc', descend: 'status_desc' },
  ownerName: { ascend: 'owner_asc', descend: 'owner_desc' },
  lastFollowedAt: { ascend: 'last_follow_asc', descend: 'last_follow_desc' },
};

export function createSortableColumnProps(
  columnKey: CreatorLibrarySortableColumnKey,
  sort: CreatorLibrarySort
) {
  return {
    sorter: true,
    sortDirections: ['ascend', 'descend'] as Array<'ascend' | 'descend'>,
    sortOrder: resolveTableSortOrder(columnKey, sort),
    showSorterTooltip: false,
  };
}

export function resolveSortFromTable(
  columnKey: Key | undefined,
  order: CreatorLibraryTableSortOrder
): CreatorLibrarySort | null {
  if (!columnKey || !order) {
    return null;
  }
  const sortPair = TABLE_SORT_MAP[String(columnKey) as CreatorLibrarySortableColumnKey];
  return sortPair?.[order] ?? null;
}

function resolveTableSortOrder(
  columnKey: CreatorLibrarySortableColumnKey,
  sort: CreatorLibrarySort
): CreatorLibraryTableSortOrder {
  const sortPair = TABLE_SORT_MAP[columnKey];
  if (sort === sortPair.ascend) {
    return 'ascend';
  }
  if (sort === sortPair.descend) {
    return 'descend';
  }
  return null;
}
