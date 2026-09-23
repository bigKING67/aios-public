import { Alert, Form, Input, InputNumber, Modal } from "antd";

import type { SampleInventorySample } from "@/lib/generated-api-contract";
import styles from "../sample-inventory.module.css";

export type AdjustmentFormValues = {
  quantityDelta: number;
  reason: string;
};

type AdjustmentModalProps = {
  open: boolean;
  item: SampleInventorySample | null;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: AdjustmentFormValues) => void;
};

export function AdjustmentModal({
  open,
  item,
  loading,
  onCancel,
  onSubmit,
}: AdjustmentModalProps) {
  const [form] = Form.useForm<AdjustmentFormValues>();
  return (
    <Modal
      open={open}
      title={item ? `调整库存 · ${item.sampleName}` : "调整库存"}
      okText="确认调整"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      afterClose={() => form.resetFields()}
      destroyOnHidden
    >
      {item && (
        <Alert
          className={styles.modalAlert}
          type="info"
          showIcon
          title={`当前在手 ${item.onHandQuantity}，预留 ${item.reservedQuantity}，可用 ${item.availableQuantity}`}
        />
      )}
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark="optional"
      >
        <Form.Item
          label="库存增减量"
          name="quantityDelta"
          extra="入库请使用入库登记；这里仅用于盘点差异等人工补偿。"
          rules={[
            { required: true, message: "请输入库存增减量" },
            {
              validator: (_, value) =>
                value === 0
                  ? Promise.reject(new Error("增减量不能为 0"))
                  : Promise.resolve(),
            },
          ]}
        >
          <InputNumber
            precision={0}
            className={styles.fullWidthControl}
            placeholder="正数增加，负数减少"
          />
        </Form.Item>
        <Form.Item
          label="调整原因"
          name="reason"
          rules={[{ required: true, message: "请输入调整原因" }]}
        >
          <Input.TextArea maxLength={500} rows={3} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
