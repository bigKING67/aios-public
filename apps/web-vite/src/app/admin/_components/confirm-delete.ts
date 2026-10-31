import { confirmModal } from '@lobehub/ui';

/** Destructive confirmation that replaced the antd Popconfirm on admin delete buttons. */
export function confirmDelete({ title, content, onConfirm }: { title: string; content: string; onConfirm: () => void }) {
  confirmModal({
    title,
    content,
    okText: '删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk: onConfirm,
  });
}
