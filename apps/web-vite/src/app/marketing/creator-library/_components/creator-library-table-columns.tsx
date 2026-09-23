import type { ColumnsType } from 'antd/es/table';
import tableStyles from '../creator-library-table.module.css';
import {
  formatCurrencyText,
  formatDateText,
  formatFanCountWanText,
  formatOptionalText,
} from '../_lib/creator-library-formatters';
import type { CreatorLibraryItem, CreatorLibrarySort } from '../_lib/creator-library-types';
import { renderCreatorActions } from './creator-library-table-actions';
import {
  createTableBodyCellProps,
  createTableHeaderCellProps,
} from './creator-library-table-layout';
import {
  renderCooperationStatusTag,
  renderCreatorLevelTag,
  renderCreatorTags,
  renderDescriptionText,
  renderFollowLogCount,
  renderPlatformTag,
} from './creator-library-table-cells';
import { createSortableColumnProps } from './creator-library-table-sorting';
import type {
  CreatorLibrarySortableColumnKey,
  CreatorLibraryTableActions,
} from './creator-library-table-types';

interface BuildCreatorLibraryTableColumnsOptions extends CreatorLibraryTableActions {
  sort: CreatorLibrarySort;
}

export function buildCreatorLibraryTableColumns({
  sort,
  onView,
  onEdit,
  onFollow,
  onAssign,
  onDelete,
}: BuildCreatorLibraryTableColumnsOptions): ColumnsType<CreatorLibraryItem> {
  const headerCellProps = () => createTableHeaderCellProps();
  const centerCellProps = () => createTableBodyCellProps('center');
  const rightCellProps = () => createTableBodyCellProps('right');
  const sortable = (columnKey: CreatorLibrarySortableColumnKey) =>
    createSortableColumnProps(columnKey, sort);
  const actions = { onView, onEdit, onFollow, onAssign, onDelete };

  return [
    {
      title: '达人ID',
      key: 'identity',
      width: 190,
      fixed: 'left',
      align: 'center',
      ...sortable('identity'),
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (_, record) => (
        <div className={tableStyles.identityCell}>
          <strong>{formatOptionalText(record.influencerId)}</strong>
        </div>
      ),
    },
    {
      title: '达人昵称',
      dataIndex: 'influencerName',
      key: 'influencerName',
      width: 180,
      fixed: 'left',
      align: 'center',
      ...sortable('influencerName'),
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (value: string, record) => (
        <div className={tableStyles.nameCell}>
          <button type="button" onClick={() => onView(record)}>
            {value}
          </button>
        </div>
      ),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 100,
      fixed: 'left',
      align: 'center',
      ...sortable('platform'),
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (value: string) => renderPlatformTag(value),
    },
    {
      title: '粉丝数',
      key: 'fans',
      width: 120,
      ...sortable('fans'),
      onHeaderCell: headerCellProps,
      onCell: rightCellProps,
      render: (_, record) => (
        <span className={tableStyles.numericText}>
          {formatFanCountWanText(record.mainPlatformFans, record.mainPlatformFansCount)}
        </span>
      ),
    },
    {
      title: '主播标签',
      key: 'tags',
      width: 190,
      align: 'center',
      ...sortable('tags'),
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (_, record) => renderCreatorTags(record),
    },
    {
      title: '达人等级',
      dataIndex: 'anchorLevel',
      key: 'anchorLevel',
      width: 110,
      align: 'center',
      ...sortable('anchorLevel'),
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (value?: string | null) => renderCreatorLevelTag(value),
    },
    {
      title: '近90天带货GMV',
      key: 'sales90d',
      width: 180,
      align: 'right',
      ...sortable('sales90d'),
      onHeaderCell: headerCellProps,
      onCell: rightCellProps,
      render: (_, record) => (
        <span className={tableStyles.numericText}>
          {formatCurrencyText(record.sales90d, record.sales90dAmount)}
        </span>
      ),
    },
    {
      title: '合作状态',
      key: 'status',
      width: 140,
      align: 'center',
      ...sortable('status'),
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (_, record) => renderCooperationStatusTag(record),
    },
    {
      title: '归属BD',
      dataIndex: 'ownerName',
      key: 'ownerName',
      width: 120,
      align: 'center',
      ...sortable('ownerName'),
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (value?: string | null) => formatOptionalText(value),
    },
    {
      title: '最近跟进',
      dataIndex: 'lastFollowedAt',
      key: 'lastFollowedAt',
      width: 120,
      align: 'center',
      ...sortable('lastFollowedAt'),
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (value?: string | null) => formatDateText(value),
    },
    {
      title: '跟进历史',
      dataIndex: 'followLogCount',
      key: 'followLogCount',
      width: 128,
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (value: number | null | undefined, record) => (
        <button
          type="button"
          className={tableStyles.followHistoryButton}
          onClick={() => onFollow(record)}
        >
          {renderFollowLogCount(value)}
        </button>
      ),
    },
    {
      title: '合作描述',
      dataIndex: 'cooperationDesc',
      key: 'cooperationDesc',
      width: 240,
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (value?: string | null) => renderDescriptionText(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 340,
      fixed: 'right',
      align: 'center',
      onHeaderCell: headerCellProps,
      onCell: centerCellProps,
      render: (_, record) => renderCreatorActions(record, actions),
    },
  ];
}
