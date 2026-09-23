import { Button, Popconfirm } from "antd";

import styles from "../sample-inventory-workspace.module.css";

type SampleInventoryInboundBatchBarProps = {
  disabled: boolean;
  selectedCount: number;
  onConfirm: () => void;
};

export function SampleInventoryInboundBatchBar({
  disabled,
  selectedCount,
  onConfirm,
}: SampleInventoryInboundBatchBarProps) {
  return (
    <div className={styles.batchBar}>
      <strong>{selectedCount ? `已选择 ${selectedCount} 条` : "勾选左侧复选框后删除"}</strong>
      <Popconfirm
        title={`删除已选择的 ${selectedCount} 条入库记录？`}
        description="删除后对应库存会在同一事务中冲正；库存不足时不会删除。"
        okText="确认删除"
        cancelText="取消"
        disabled={disabled}
        onConfirm={onConfirm}
      >
        <Button size="small" danger disabled={disabled}>
          🗑 批量删除入库记录
        </Button>
      </Popconfirm>
    </div>
  );
}
