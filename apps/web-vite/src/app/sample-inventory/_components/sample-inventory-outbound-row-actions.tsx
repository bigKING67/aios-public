import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  FormOutlined,
  RedoOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import { Button, Popconfirm, Space } from "antd";

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
    <Space size="small" wrap={false}>
      {item.status === "pending" && (
        <>
          <Button type="link" size="small" icon={<EditOutlined aria-hidden="true" />} onClick={() => onEdit(item)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CheckCircleOutlined aria-hidden="true" />}
            title={`审批通过后立即扣减库存 ${item.quantity}，手工预留不变`}
            onClick={() => onTransition(item, "approved")}
          >
            通过
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<CloseCircleOutlined aria-hidden="true" />}
            onClick={() => onTransition(item, "rejected")}
          >
            驳回
          </Button>
          <Popconfirm
            title="删除该待审批记录？"
            description="待审批记录尚未影响库存。"
            onConfirm={() => onArchive(item)}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined aria-hidden="true" />}>
              删除
            </Button>
          </Popconfirm>
        </>
      )}
      {item.status === "approved" && (
        <>
          <Button
            type="link"
            size="small"
            icon={<FormOutlined aria-hidden="true" />}
            onClick={() => onEditTracking(item)}
          >
            编辑单号
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ExperimentOutlined aria-hidden="true" />}
            title="确认取样只更新流程状态，库存不再变化"
            onClick={() => onTransition(item, "sampled")}
          >
            确认取样
          </Button>
          <Button
            type="link"
            size="small"
            icon={<RollbackOutlined aria-hidden="true" />}
            title={`撤回待审批后恢复库存 ${item.quantity}，手工预留不变`}
            onClick={() => onTransition(item, "pending")}
          >
            撤回
          </Button>
          <Popconfirm
            title="删除该已审批记录并恢复库存？"
            description={`将回补库存 ${item.quantity}，手工预留不变。`}
            onConfirm={() => onArchive(item)}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined aria-hidden="true" />}>
              删除
            </Button>
          </Popconfirm>
        </>
      )}
      {item.status === "sampled" && (
        <>
          <Button
            type="link"
            size="small"
            icon={<RollbackOutlined aria-hidden="true" />}
            title="仅回退流程状态，库存保持不变"
            onClick={() => onTransition(item, "approved")}
          >
            退回已审批
          </Button>
          <Popconfirm
            title="删除该已取样记录并恢复库存？"
            description={`将回补库存 ${item.quantity}，手工预留不变。`}
            onConfirm={() => onArchive(item)}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined aria-hidden="true" />}>
              删除
            </Button>
          </Popconfirm>
        </>
      )}
      {item.status === "rejected" && (
        <>
          <Button
            type="link"
            size="small"
            icon={<RedoOutlined aria-hidden="true" />}
            onClick={() => onTransition(item, "pending")}
          >
            重新提交
          </Button>
          <Popconfirm title="删除该已驳回记录？" onConfirm={() => onArchive(item)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined aria-hidden="true" />}>
              删除
            </Button>
          </Popconfirm>
        </>
      )}
    </Space>
  );
}
