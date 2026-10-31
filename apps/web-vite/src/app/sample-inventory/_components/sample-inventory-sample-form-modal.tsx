import { useEffect } from "react";
import { Input, InputNumber, Modal, TextArea } from "@lobehub/ui";

import { FormField } from "@/components/molecules/form-field";
import { bindNumberField, bindTextField, useControlledForm } from "@/hooks/use-controlled-form";

import type { SampleInventorySample } from "@/lib/generated-api-contract";
import styles from "../sample-inventory.module.css";

export type SampleFormValues = {
  sampleCode: string;
  sampleName: string;
  model?: string;
  category?: string;
  remark?: string;
  initialQuantity?: number;
  reservedQuantity?: number;
};

type SampleFormModalProps = {
  open: boolean;
  item: SampleInventorySample | null;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: SampleFormValues) => void;
};

type SampleFormDraft = Partial<SampleFormValues>;

function stockOf(item: SampleInventorySample | null, values: SampleFormDraft): number {
  return item?.onHandQuantity ?? Number(values.initialQuantity ?? 0);
}

export function SampleFormModal({
  open,
  item,
  loading,
  onCancel,
  onSubmit,
}: SampleFormModalProps) {
  const form = useControlledForm<SampleFormDraft>({
    initialValues: item
      ? {
          sampleCode: item.sampleCode,
          sampleName: item.sampleName,
          model: item.model ?? undefined,
          category: item.category ?? undefined,
          remark: item.remark ?? undefined,
          reservedQuantity: item.reservedQuantity,
        }
      : { initialQuantity: 0, reservedQuantity: 0 },
    rules: {
      sampleCode: [{ required: true, message: "请输入样品编码" }],
      sampleName: [{ required: true, message: "请输入样品名称" }],
      reservedQuantity: [
        {
          validator: (value) => {
            const quantity = (value as number | undefined) ?? 0;
            return Number.isInteger(quantity) && quantity >= 0;
          },
          message: "预留必须是非负整数",
        },
        {
          validator: (value, values) => ((value as number | undefined) ?? 0) <= stockOf(item, values),
          message: "预留不能超过库存",
        },
      ],
    },
    onFinish: (values) => onSubmit(values as SampleFormValues),
  });

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, item, open]);

  // 预留 depends on 期初库存: re-check it when the stock changes, as antd `dependencies` did.
  const changeInitialQuantity = (value: number | null) => {
    form.change("initialQuantity", value ?? undefined);
    if (form.isFieldTouched("reservedQuantity")) form.change("reservedQuantity", form.getFieldValue("reservedQuantity"));
  };

  const stockQuantity = stockOf(item, form.values);
  const reservedQuantity = Number(form.values.reservedQuantity ?? 0);

  return (
    <Modal
      open={open}
      title={item ? `编辑样品 · ${item.sampleCode}` : "新建样品"}
      okText={item ? "保存" : "创建"}
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <div className={styles.formGrid}>
        <FormField form={form} name="sampleCode" label="样品编码" required>
          <Input {...bindTextField(form, "sampleCode")} maxLength={120} placeholder="支持数字、字母、中文及混合编码" />
        </FormField>
        <FormField form={form} name="sampleName" label="样品名称" required>
          <Input {...bindTextField(form, "sampleName")} maxLength={200} />
        </FormField>
        <FormField form={form} name="model" label="型号">
          <Input {...bindTextField(form, "model")} maxLength={200} />
        </FormField>
        <FormField form={form} name="category" label="分类">
          <Input {...bindTextField(form, "category")} maxLength={120} />
        </FormField>
        {!item && (
          <FormField form={form} name="initialQuantity" label="期初库存">
            <InputNumber
              id={form.fieldId("initialQuantity")}
              min={0}
              precision={0}
              className={styles.fullWidthControl}
              value={form.values.initialQuantity ?? null}
              onChange={changeInitialQuantity}
            />
          </FormField>
        )}
        <FormField form={form} name="reservedQuantity" label="预留">
          <InputNumber
            {...bindNumberField(form, "reservedQuantity")}
            // No max: a value above stock stays visible and is rejected with 预留不能超过库存.
            min={0}
            precision={0}
            className={styles.fullWidthControl}
          />
        </FormField>
      </div>
      <div
        className={`${styles.reservationSummary} ${reservedQuantity > 0 ? styles.reservationSummaryActive : ""}`}
        role="status"
        aria-live="polite"
      >
        库存 {stockQuantity}，保存后可用 {stockQuantity - reservedQuantity}
      </div>
      <FormField form={form} name="remark" label="备注">
        <TextArea {...bindTextField(form, "remark")} maxLength={2000} rows={3} showCount />
      </FormField>
    </Modal>
  );
}
