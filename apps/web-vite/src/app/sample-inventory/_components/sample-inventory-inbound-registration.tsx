import { useMemo } from "react";
import { Button, Input, InputNumber } from "@lobehub/ui";

import { FormField } from "@/components/molecules/form-field";
import { LabeledSelect } from "@/components/molecules/labeled-select";
import {
  bindNumberField,
  bindSelectField,
  bindTextField,
  type ControlledFormRules,
  useControlledForm,
} from "@/hooks/use-controlled-form";

import type {
  CreateSampleInventoryInboundItem,
  SampleInventorySample,
} from "@/lib/generated-api-contract";
import { normalizeSampleInventoryOptionalText } from "../_lib/sample-inventory-formatters";
import styles from "../sample-inventory-registration.module.css";

type InboundRegistrationValues = {
  sampleId: number;
  quantity: number;
  operatorName?: string;
  trackingNumber?: string;
  remark?: string;
};

const INBOUND_REGISTRATION_RULES: ControlledFormRules<Partial<InboundRegistrationValues>> = {
  sampleId: [{ required: true, message: "请选择样品" }],
  quantity: [{ required: true, message: "请输入入库数量" }],
};

type SampleInventoryInboundRegistrationProps = {
  samples: SampleInventorySample[];
  readOnly: boolean;
  submitting: boolean;
  onSubmit: (payload: CreateSampleInventoryInboundItem) => Promise<void>;
  onOpenBatchInbound: () => void;
  onOpenInboundImport: () => void;
  onExport: () => void;
};

export function SampleInventoryInboundRegistration({
  samples,
  readOnly,
  submitting,
  onSubmit,
  onOpenBatchInbound,
  onOpenInboundImport,
  onExport,
}: SampleInventoryInboundRegistrationProps) {
  const form = useControlledForm<Partial<InboundRegistrationValues>>({
    initialValues: { quantity: 1 },
    rules: INBOUND_REGISTRATION_RULES,
    onFinish: (values) => void submit(values as InboundRegistrationValues),
  });
  const selectedSampleId = form.values.sampleId;
  const selectedSample = useMemo(
    () => samples.find((sample) => sample.id === selectedSampleId),
    [samples, selectedSampleId],
  );

  async function submit(values: InboundRegistrationValues) {
    try {
      await onSubmit({
        sampleId: values.sampleId,
        quantity: values.quantity,
        operatorName: normalizeSampleInventoryOptionalText(values.operatorName),
        trackingNumber: normalizeSampleInventoryOptionalText(
          values.trackingNumber,
        ),
        remark: normalizeSampleInventoryOptionalText(values.remark),
        occurredAt: undefined,
      });
      // Keep the sample and operator for the next entry.
      form.setFieldsValue({ quantity: 1, trackingNumber: undefined, remark: undefined });
    } catch {
      // The mutation owns user-visible error feedback and keeps the form intact.
    }
  }

  return (
    <>
      <section className={styles.formArea} aria-label="入库登记">
        <form
          className={styles.inboundInlineForm}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            form.submit();
          }}
        >
          <FormField form={form} name="sampleId" label="选择样品" required>
            <LabeledSelect
              {...bindSelectField(form, "sampleId")}
              showSearch
              placeholder="— 请选择 —"
              options={samples.map((sample) => ({
                value: sample.id,
                label: `${sample.sampleName}（${sample.sampleCode}）`,
              }))}
            />
          </FormField>
          <FormField form={form} name="quantity" label="入库数量" required>
            <InputNumber {...bindNumberField(form, "quantity")} min={1} precision={0} />
          </FormField>
          <FormField form={form} name="operatorName" label="操作人">
            <Input {...bindTextField(form, "operatorName")} placeholder="姓名" maxLength={120} />
          </FormField>
          <FormField form={form} name="trackingNumber" label="快递单号">
            <Input {...bindTextField(form, "trackingNumber")} placeholder="快递单号" maxLength={200} />
          </FormField>
          <FormField form={form} name="remark" label="备注" className={styles.inboundRemarkField}>
            <Input {...bindTextField(form, "remark")} placeholder="入库备注" maxLength={2000} />
          </FormField>
          <div className={`${styles.submitField} ${styles.inboundSubmitField}`}>
            <div className={styles.inboundActions}>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                disabled={readOnly || samples.length === 0}
              >
                ✅ 确认入库
              </Button>
              <Button htmlType="button" disabled={readOnly} onClick={onOpenBatchInbound}>
                📥 批量入库
              </Button>
              <Button htmlType="button" disabled={readOnly} onClick={onOpenInboundImport}>
                📥 导入入库Excel
              </Button>
              <Button htmlType="button" onClick={onExport}>
                📊 导出Excel
              </Button>
            </div>
          </div>
        </form>
      </section>
      <div className={styles.selectedInfo} aria-live="polite">
        {selectedSample
          ? `📦 ${selectedSample.sampleName} 当前库存：${selectedSample.onHandQuantity}，可用：${selectedSample.availableQuantity}`
          : "👆 请选择样品，此处显示当前库存"}
      </div>
    </>
  );
}
