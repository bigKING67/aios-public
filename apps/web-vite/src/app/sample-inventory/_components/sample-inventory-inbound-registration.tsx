import { useMemo } from "react";
import { Button, Form, Input, InputNumber, Select } from "antd";

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
  const [form] = Form.useForm<InboundRegistrationValues>();
  const selectedSampleId = Form.useWatch("sampleId", form);
  const selectedSample = useMemo(
    () => samples.find((sample) => sample.id === selectedSampleId),
    [samples, selectedSampleId],
  );

  const submit = async (values: InboundRegistrationValues) => {
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
      form.resetFields(["quantity", "trackingNumber", "remark"]);
      form.setFieldValue("quantity", 1);
    } catch {
      // The mutation owns user-visible error feedback and keeps the form intact.
    }
  };

  return (
    <>
      <section className={styles.formArea} aria-label="入库登记">
        <Form<InboundRegistrationValues>
          form={form}
          className={styles.inboundInlineForm}
          layout="vertical"
          requiredMark={false}
          initialValues={{ quantity: 1 }}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item label="选择样品 *" name="sampleId" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="— 请选择 —"
              optionFilterProp="label"
              options={samples.map((sample) => ({
                value: sample.id,
                label: `${sample.sampleName}（${sample.sampleCode}）`,
              }))}
            />
          </Form.Item>
          <Form.Item label="入库数量 *" name="quantity" rules={[{ required: true }]}>
            <InputNumber min={1} precision={0} />
          </Form.Item>
          <Form.Item label="操作人" name="operatorName">
            <Input placeholder="姓名" maxLength={120} />
          </Form.Item>
          <Form.Item label="快递单号" name="trackingNumber">
            <Input placeholder="快递单号" maxLength={200} />
          </Form.Item>
          <Form.Item className={styles.inboundRemarkField} label="备注" name="remark">
            <Input placeholder="入库备注" maxLength={2000} />
          </Form.Item>
          <Form.Item className={`${styles.submitField} ${styles.inboundSubmitField}`} label=" ">
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
          </Form.Item>
        </Form>
      </section>
      <div className={styles.selectedInfo} aria-live="polite">
        {selectedSample
          ? `📦 ${selectedSample.sampleName} 当前库存：${selectedSample.onHandQuantity}，可用：${selectedSample.availableQuantity}`
          : "👆 请选择样品，此处显示当前库存"}
      </div>
    </>
  );
}
