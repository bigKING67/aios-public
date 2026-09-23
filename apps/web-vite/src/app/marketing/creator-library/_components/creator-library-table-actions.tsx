import { Button, Popconfirm, Space, Tooltip } from 'antd';
import tableStyles from '../creator-library-table.module.css';
import type { CreatorLibraryItem } from '../_lib/creator-library-types';
import type { CreatorLibraryTableActions } from './creator-library-table-types';

export function renderCreatorActions(
  record: CreatorLibraryItem,
  { onView, onEdit, onFollow, onAssign, onDelete }: CreatorLibraryTableActions
) {
  return (
    <Space size={4} wrap={false} className={tableStyles.actionCell}>
      <Button size="small" type="link" onClick={() => onView(record)}>
        详情
      </Button>
      <Tooltip title={record.canEdit ? undefined : '当前达人无编辑权限'}>
        <Button size="small" type="link" disabled={!record.canEdit} onClick={() => onEdit(record)}>
          编辑
        </Button>
      </Tooltip>
      <Tooltip title={record.canEdit ? undefined : '当前达人无编辑权限'}>
        <Button
          size="small"
          type="link"
          disabled={!record.canEdit}
          onClick={() => onFollow(record)}
        >
          跟进
        </Button>
      </Tooltip>
      <Tooltip title={record.canEdit ? undefined : '当前达人无编辑权限'}>
        <Button
          size="small"
          type="link"
          disabled={!record.canEdit}
          onClick={() => onAssign(record)}
        >
          分配BD
        </Button>
      </Tooltip>
      <Tooltip title={resolveDeleteDisabledText(record)}>
        <Popconfirm
          title="删除达人"
          description="删除后该达人将从当前达人库列表中移除。"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          disabled={!record.canDelete}
          onConfirm={() => onDelete(record)}
        >
          <Button size="small" type="link" danger disabled={!record.canDelete}>
            删除
          </Button>
        </Popconfirm>
      </Tooltip>
    </Space>
  );
}

function resolveDeleteDisabledText(record: CreatorLibraryItem): string | undefined {
  if (record.canDelete) {
    return undefined;
  }
  if (record.ownershipType === 'public_seed') {
    return '当前达人不支持删除';
  }
  return '只能删除当前归属自己的达人';
}
