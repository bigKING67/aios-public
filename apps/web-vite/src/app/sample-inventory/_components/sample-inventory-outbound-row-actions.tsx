import { CircleCheck, CircleX, FlaskConical, Pencil, Redo2, SquarePen, Trash2, Undo2 } from 'lucide-react';
import { Button, confirmModal, Flexbox } from '@lobehub/ui';

import type {
  SampleInventoryOutboundStatus,
  SampleInventoryOutboundView,
} from "../_lib/sample-inventory-types";

type SampleInventoryOutboundRowActionsProps = {
  item: SampleInventoryOutboundView;
  onEdit: (item: SampleInventoryOutboundView) => void;
  onEditTracking: (item: SampleInventoryOutboundView) => void;
  onTransition: (item: SampleInventoryOutboundView, target: SampleInventoryOutboundStatus) => void;
  onArchive: (item: SampleInventoryOutboundView) => void;
};

export function SampleInventoryOutboundRowActions({
  item,
  onEdit,
  onEditTracking,
  onTransition,
  onArchive,
}: SampleInventoryOutboundRowActionsProps) {
  return (
    <Flexbox horizontal gap={8}>
      {item.status === "pending" && (
        <>
          <Button type="link" size="small" icon={<Pencil size={14} strokeWidth={1.8} aria-hidden="true" />} onClick={() => onEdit(item)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CircleCheck size={14} strokeWidth={1.8} aria-hidden="true" />}
            title={`审批通过后立即扣减库存 ${item.quantity}，手工预留不变`}
            onClick={() => onTransition(item, "approved")}
          >
            通过
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<CircleX size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={() => onTransition(item, "rejected")}
          >
            驳回
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={() =>
              confirmModal({
                title: '删除该待审批记录？',
                content: '待审批记录尚未影响库存。',
                okButtonProps: { danger: true },
                onOk: () => onArchive(item),
              })
            }
          >
            删除
          </Button>
        </>
      )}
      {item.status === "approved" && (
        <>
          <Button
            type="link"
            size="small"
            icon={<SquarePen size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={() => onEditTracking(item)}
          >
            编辑单号
          </Button>
          <Button
            type="link"
            size="small"
            icon={<FlaskConical size={14} strokeWidth={1.8} aria-hidden="true" />}
            title="确认取样只更新流程状态，库存不再变化"
            onClick={() => onTransition(item, "sampled")}
          >
            确认取样
          </Button>
          <Button
            type="link"
            size="small"
            icon={<Undo2 size={14} strokeWidth={1.8} aria-hidden="true" />}
            title={`撤回待审批后恢复库存 ${item.quantity}，手工预留不变`}
            onClick={() => onTransition(item, "pending")}
          >
            撤回
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={() =>
              confirmModal({
                title: '删除该已审批记录并恢复库存？',
                content: `将回补库存 ${item.quantity}，手工预留不变。`,
                okButtonProps: { danger: true },
                onOk: () => onArchive(item),
              })
            }
          >
            删除
          </Button>
        </>
      )}
      {item.status === "sampled" && (
        <>
          <Button
            type="link"
            size="small"
            icon={<Undo2 size={14} strokeWidth={1.8} aria-hidden="true" />}
            title="仅回退流程状态，库存保持不变"
            onClick={() => onTransition(item, "approved")}
          >
            退回已审批
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={() =>
              confirmModal({
                title: '删除该已取样记录并恢复库存？',
                content: `将回补库存 ${item.quantity}，手工预留不变。`,
                okButtonProps: { danger: true },
                onOk: () => onArchive(item),
              })
            }
          >
            删除
          </Button>
        </>
      )}
      {item.status === "rejected" && (
        <>
          <Button
            type="link"
            size="small"
            icon={<Redo2 size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={() => onTransition(item, "pending")}
          >
            重新提交
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />}
            onClick={() =>
              confirmModal({
                title: '删除该已驳回记录？',
                okButtonProps: { danger: true },
                onOk: () => onArchive(item),
              })
            }
          >
            删除
          </Button>
        </>
      )}
    </Flexbox>
  );
}
