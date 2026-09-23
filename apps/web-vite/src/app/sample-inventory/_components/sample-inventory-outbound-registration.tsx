import { useMemo, useRef, useState } from "react";
import { Button, Checkbox, Form, Input, InputNumber } from "antd";

import type {
  CreateSampleInventoryOutboundBatchRequest,
  SampleInventorySample,
} from "@/lib/generated-api-contract";
import styles from "../sample-inventory-registration.module.css";

type OutboundRegistrationValues = {
  applicant: string;
  department: string;
  purpose: string;
  receiver: string;
  shippingAddress: string;
};

type SampleInventoryOutboundRegistrationProps = {
  samples: SampleInventorySample[];
  readOnly: boolean;
  submitting: boolean;
  onSubmit: (payload: CreateSampleInventoryOutboundBatchRequest) => Promise<void>;
};

function createSubmissionKey(): string {
  return `outbound-${crypto.randomUUID()}`;
}

export function SampleInventoryOutboundRegistration({
  samples,
  readOnly,
  submitting,
  onSubmit,
}: SampleInventoryOutboundRegistrationProps) {
  const [form] = Form.useForm<OutboundRegistrationValues>();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const submissionKeyRef = useRef<string | undefined>(undefined);

  const availableSamples = useMemo(
    () => samples.filter((sample) => sample.availableQuantity > 0),
    [samples],
  );

  const toggleSample = (sample: SampleInventorySample) => {
    if (readOnly || sample.availableQuantity <= 0) return;
    setSelectedIds((current) => {
      if (current.includes(sample.id)) {
        return current.filter((id) => id !== sample.id);
      }
      setQuantities((values) => ({ ...values, [sample.id]: 1 }));
      return [...current, sample.id];
    });
    submissionKeyRef.current = undefined;
  };

  const submit = async (values: OutboundRegistrationValues) => {
    const selected = availableSamples.filter((sample) =>
      selectedIds.includes(sample.id),
    );
    if (selected.length === 0) return;
    const submissionKey = submissionKeyRef.current ?? createSubmissionKey();
    submissionKeyRef.current = submissionKey;
    const common = {
      applicant: values.applicant.trim(),
      department: values.department.trim(),
      purpose: values.purpose.trim(),
      receiver: values.receiver.trim(),
      shippingAddress: values.shippingAddress.trim(),
      trackingNumber: undefined,
      requestedAt: undefined,
    };
    try {
      await onSubmit({
        submissionKey,
        items: selected.map((sample) => ({
          ...common,
          sampleId: sample.id,
          quantity: quantities[sample.id] ?? 1,
        })),
      });
      setSelectedIds([]);
      setQuantities({});
      submissionKeyRef.current = undefined;
      form.resetFields();
    } catch {
      // The mutation owns user-visible error feedback; retain the key for an exact retry.
    }
  };

  return (
    <section className={styles.formArea} aria-labelledby="outbound-register-title">
      <div className={styles.sectionHeading}>
        <strong id="outbound-register-title">📤 出库登记</strong>
        <span>点击卡片选择样品，每个样品可单独设置出库数量</span>
      </div>

      <div className={styles.sampleCardGrid}>
        {availableSamples.length === 0 ? (
          <div className={styles.inlineEmpty}>暂无可出库样品</div>
        ) : (
          availableSamples.map((sample) => {
            const selected = selectedIds.includes(sample.id);
            return (
              <div
                key={sample.id}
                className={`${styles.sampleCard} ${selected ? styles.sampleCardSelected : ""}`}
                role="checkbox"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => toggleSample(sample)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSample(sample);
                  }
                }}
              >
                <Checkbox
                  checked={selected}
                  aria-label={`选择${sample.sampleName}`}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => toggleSample(sample)}
                />
                <div className={styles.sampleCardBody}>
                  <strong title={sample.sampleName}>{sample.sampleName}</strong>
                  <span className={styles.sampleCode} title={sample.sampleCode}>
                    {sample.sampleCode}
                  </span>
                  <span
                    className={
                      sample.isLowStock
                        ? `${styles.sampleStock} ${styles.sampleStockLow}`
                        : styles.sampleStock
                    }
                    title={sample.isLowStock ? "低库存预警" : undefined}
                  >
                    📦 库存：{sample.availableQuantity} 个
                  </span>
                </div>
                <InputNumber
                  className={styles.sampleQuantity}
                  aria-label={`${sample.sampleName}出库数量`}
                  min={1}
                  max={sample.availableQuantity}
                  precision={0}
                  value={quantities[sample.id] ?? 1}
                  disabled={!selected || readOnly}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(value) => {
                    const next = Math.max(
                      1,
                      Math.min(sample.availableQuantity, Number(value) || 1),
                    );
                    setQuantities((current) => ({
                      ...current,
                      [sample.id]: next,
                    }));
                    submissionKeyRef.current = undefined;
                  }}
                />
              </div>
            );
          })
        )}
      </div>

      <Form<OutboundRegistrationValues>
        form={form}
        className={styles.inlineForm}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => void submit(values)}
      >
        <Form.Item label="申领人 *" name="applicant" rules={[{ required: true }]}>
          <Input placeholder="姓名" maxLength={120} />
        </Form.Item>
        <Form.Item label="部门 *" name="department" rules={[{ required: true }]}>
          <Input placeholder="部门名称" maxLength={120} />
        </Form.Item>
        <Form.Item label="邮寄用途 *" name="purpose" rules={[{ required: true }]}>
          <Input placeholder="如：客户演示..." maxLength={1000} />
        </Form.Item>
        <Form.Item
          label="收货人 *"
          name="receiver"
          rules={[{ required: true, whitespace: true, message: "请输入收货人" }]}
        >
          <Input placeholder="收货人姓名" maxLength={120} />
        </Form.Item>
        <Form.Item
          className={styles.addressField}
          label="收货地址 *"
          name="shippingAddress"
          rules={[{ required: true, whitespace: true, message: "请输入收货地址" }]}
        >
          <Input placeholder="详细地址" maxLength={1000} />
        </Form.Item>
        <Form.Item className={styles.submitField} label=" ">
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            disabled={readOnly || selectedIds.length === 0}
          >
            📤 提交出库{selectedIds.length > 0 ? `（${selectedIds.length}）` : ""}
          </Button>
        </Form.Item>
      </Form>
    </section>
  );
}
