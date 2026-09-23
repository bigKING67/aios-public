import { useState } from "react";
import { Button, Input, Popconfirm, Space } from "antd";

import type { SampleInventoryOutboundStatus } from "../_lib/sample-inventory-types";
import type { SampleInventoryPendingBatchEdit } from "../_hooks/use-sample-inventory-batch-actions";
import styles from "../sample-inventory-workspace.module.css";

type SampleInventoryBatchActionsBarProps = {
  activeStatus: SampleInventoryOutboundStatus;
  selectedCount: number;
  selectedStatus?: SampleInventoryOutboundStatus;
  onTransition: (status: SampleInventoryOutboundStatus) => void;
  onArchive: () => void;
  onTracking: (trackingNumber: string) => void;
  onEditPending: (values: SampleInventoryPendingBatchEdit) => void;
};

export function SampleInventoryBatchActionsBar({
  activeStatus,
  selectedCount,
  selectedStatus,
  onTransition,
  onArchive,
  onTracking,
  onEditPending,
}: SampleInventoryBatchActionsBarProps) {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [pendingEdit, setPendingEdit] = useState({
    applicant: "",
    department: "",
    purpose: "",
    receiver: "",
    shippingAddress: "",
  });
  const hasPendingEdit = Object.values(pendingEdit).some((value) => value.trim());
  const effectiveStatus = selectedCount === 0 ? activeStatus : selectedStatus;
  const hasSelection = selectedCount > 0;
  const batchLabel: Record<SampleInventoryOutboundStatus, string> = {
    pending: "⏳ 批量操作",
    approved: "✅ 批量操作",
    sampled: "🧪 批量操作",
    rejected: "❌ 批量操作",
  };

  return (
    <div className={styles.batchBar}>
      <strong>{batchLabel[activeStatus]}</strong>
      <Space size="small" wrap>
        {(effectiveStatus === "approved" || effectiveStatus === "sampled") && (
          <Space.Compact>
            <Input
              size="small"
              value={trackingNumber}
              placeholder="输入快递单号"
              aria-label="批量快递单号"
              onChange={(event) => setTrackingNumber(event.target.value)}
            />
            <Button
              size="small"
              disabled={!hasSelection || !trackingNumber.trim()}
              title={
                !hasSelection ? "请先勾选记录" : !trackingNumber.trim() ? "请先输入快递单号" : undefined
              }
              onClick={() => onTracking(trackingNumber.trim())}
            >
              📦 批量填单号
            </Button>
          </Space.Compact>
        )}
        {effectiveStatus === "pending" && (
          <>
            <Input
              size="small"
              value={pendingEdit.applicant}
              placeholder="申领人"
              aria-label="批量申领人"
              onChange={(event) => setPendingEdit((current) => ({ ...current, applicant: event.target.value }))}
            />
            <Input
              size="small"
              value={pendingEdit.department}
              placeholder="部门"
              aria-label="批量部门"
              onChange={(event) => setPendingEdit((current) => ({ ...current, department: event.target.value }))}
            />
            <Input
              size="small"
              value={pendingEdit.purpose}
              placeholder="用途"
              aria-label="批量用途"
              onChange={(event) => setPendingEdit((current) => ({ ...current, purpose: event.target.value }))}
            />
            <Input
              size="small"
              value={pendingEdit.receiver}
              placeholder="收货人"
              aria-label="批量收货人"
              onChange={(event) => setPendingEdit((current) => ({ ...current, receiver: event.target.value }))}
            />
            <Input
              size="small"
              value={pendingEdit.shippingAddress}
              placeholder="地址"
              aria-label="批量地址"
              onChange={(event) => setPendingEdit((current) => ({ ...current, shippingAddress: event.target.value }))}
            />
            <Button
              size="small"
              disabled={!hasSelection || !hasPendingEdit}
              title={
                !hasSelection ? "请先勾选待审批记录" : !hasPendingEdit ? "请先填写至少一个字段" : undefined
              }
              onClick={() =>
                onEditPending(
                  Object.fromEntries(
                    Object.entries(pendingEdit)
                      .map(([key, value]) => [key, value.trim()])
                      .filter(([, value]) => value),
                  ) as SampleInventoryPendingBatchEdit,
                )
              }
            >
              ✎ 批量编辑
            </Button>
            <Button
              size="small"
              type="primary"
              disabled={!hasSelection}
              title={hasSelection ? "审批通过后立即扣减对应库存，手工预留不变" : "请先勾选待审批记录"}
              onClick={() => onTransition("approved")}
            >
              ✅ 批量通过
            </Button>
            <Button size="small" danger disabled={!hasSelection} onClick={() => onTransition("rejected")}>
              ❌ 批量驳回
            </Button>
          </>
        )}
        {effectiveStatus === "approved" && (
          <>
            <Button
              size="small"
              type="primary"
              disabled={!hasSelection}
              title={hasSelection ? "确认取样只更新流程状态，库存不再变化" : "请先勾选已审批记录"}
              onClick={() => onTransition("sampled")}
            >
              🧪 批量已取样
            </Button>
            <Button
              size="small"
              disabled={!hasSelection}
              title={hasSelection ? "撤回待审批后恢复对应库存，手工预留不变" : "请先勾选已审批记录"}
              onClick={() => onTransition("pending")}
            >
              ↩ 批量撤回
            </Button>
          </>
        )}
        {effectiveStatus === "sampled" && (
          <Button
            size="small"
            disabled={!hasSelection}
            title={hasSelection ? "撤回待审批后恢复对应库存，手工预留不变" : "请先勾选已取样记录"}
            onClick={() => onTransition("pending")}
          >
            ↩ 批量撤回待审批
          </Button>
        )}
        {effectiveStatus && (
          <Popconfirm
            title={`确认删除已选择的 ${selectedCount} 条记录？`}
            description="已审批或已取样记录会通过补偿流水恢复对应库存。"
            okText="确认删除"
            cancelText="取消"
            disabled={!hasSelection}
            onConfirm={onArchive}
          >
            <Button size="small" danger disabled={!hasSelection}>
              🗑 批量删除
            </Button>
          </Popconfirm>
        )}
        {hasSelection && !selectedStatus ? (
          <span>请选择相同状态的记录后批量处理</span>
        ) : (
          <span className={styles.batchHint}>
            {hasSelection ? `已选择 ${selectedCount} 条` : "已选择 0 条 · 先勾选记录，表头复选框可全选当前页"}
          </span>
        )}
      </Space>
    </div>
  );
}
