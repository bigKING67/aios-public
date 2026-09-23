import { Alert, Descriptions, Modal } from "antd";

import type { SampleInventoryBackupPlanResponse } from "@/lib/generated-api-contract";
import styles from "../sample-inventory.module.css";

type SampleInventoryBackupDialogProps = {
  open: boolean;
  fileName?: string;
  preview?: SampleInventoryBackupPlanResponse;
  parsing: boolean;
  restoring: boolean;
  onCancel: () => void;
  onRestore: () => void;
};

export function SampleInventoryBackupDialog({
  open,
  fileName,
  preview,
  parsing,
  restoring,
  onCancel,
  onRestore,
}: SampleInventoryBackupDialogProps) {
  const changes = preview?.changes;

  return (
    <Modal
      open={open}
      title="📥 恢复样品库存备份"
      width={680}
      okText="确认恢复"
      cancelText="取消"
      okButtonProps={{ danger: true, disabled: !preview || parsing }}
      confirmLoading={restoring}
      closable={!restoring}
      mask={{ closable: !restoring }}
      onCancel={onCancel}
      onOk={onRestore}
      destroyOnHidden
    >
      <div className={styles.importStack}>
        {fileName && <span className={styles.mutedText}>当前文件：{fileName}</span>}
        {parsing && (
          <Alert
            type="info"
            showIcon
            title="正在校验备份"
            description="系统正在核对文件版本、数据库身份、数据关系和当前状态。"
          />
        )}
        {preview && changes && (
          <>
            <Alert
              type="warning"
              showIcon
              title="恢复会把当前业务状态调整为备份状态"
              description="新增记录将归档或作废，库存差额通过补偿流水对账；历史流水和业务事件不会删除或覆盖。"
            />
            <Descriptions bordered size="small" column={3} title="备份内容">
              <Descriptions.Item label="样品">{preview.sampleCount}</Descriptions.Item>
              <Descriptions.Item label="入库记录">{preview.inboundCount}</Descriptions.Item>
              <Descriptions.Item label="出库记录">{preview.outboundCount}</Descriptions.Item>
            </Descriptions>
            <Descriptions bordered size="small" column={2} title="预计变更">
              <Descriptions.Item label="设置更新">{changes.settingsToUpdate}</Descriptions.Item>
              <Descriptions.Item label="样品更新">{changes.samplesToUpdate}</Descriptions.Item>
              <Descriptions.Item label="样品归档">{changes.samplesToArchive}</Descriptions.Item>
              <Descriptions.Item label="入库更新">{changes.inboundsToUpdate}</Descriptions.Item>
              <Descriptions.Item label="入库作废">{changes.inboundsToVoid}</Descriptions.Item>
              <Descriptions.Item label="出库更新">{changes.outboundsToUpdate}</Descriptions.Item>
              <Descriptions.Item label="出库归档">{changes.outboundsToArchive}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </div>
    </Modal>
  );
}
