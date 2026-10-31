import { Alert, InputNumber, Modal, TextArea } from "@lobehub/ui";
import { useEffect } from "react";

import { FormField } from "@/components/molecules/form-field";
import { bindNumberField, bindTextField, type ControlledFormRules, useControlledForm } from "@/hooks/use-controlled-form";

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

type AdjustmentDraft = Partial<AdjustmentFormValues>;

const ADJUSTMENT_RULES: ControlledFormRules<AdjustmentDraft> = {
  quantityDelta: [
    { required: true, message: "请输入库存增减量" },
    { validator: (value) => value !== 0, message: "增减量不能为 0" },
  ],
  reason: [{ required: true, message: "请输入调整原因" }],
};

export function AdjustmentModal({
  open,
  item,
  loading,
  onCancel,
  onSubmit,
}: AdjustmentModalProps) {
  const form = useControlledForm<AdjustmentDraft>({
    initialValues: {},
    rules: ADJUSTMENT_RULES,
    onFinish: (values) => onSubmit(values as AdjustmentFormValues),
  });

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open, item]);

  return (
    <Modal
      open={open}
      title={item ? `调整库存 · ${item.sampleName}` : "调整库存"}
      okText="确认调整"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.submit()}
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
      <FormField
        form={form}
        name="quantityDelta"
        label="库存增减量"
        required
        extra="入库请使用入库登记；这里仅用于盘点差异等人工补偿。"
      >
        <InputNumber
          {...bindNumberField(form, "quantityDelta")}
          precision={0}
          className={styles.fullWidthControl}
          placeholder="正数增加，负数减少"
        />
      </FormField>
      <FormField form={form} name="reason" label="调整原因" required>
        <TextArea {...bindTextField(form, "reason")} maxLength={500} rows={3} showCount />
      </FormField>
    </Modal>
  );
}
