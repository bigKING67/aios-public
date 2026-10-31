import { useId, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Input, InputNumber } from "@lobehub/ui";

import { FormField } from "@/components/molecules/form-field";
import { bindTextField, type ControlledFormRules, useControlledForm } from "@/hooks/use-controlled-form";

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

const OUTBOUND_REGISTRATION_RULES: ControlledFormRules<Partial<OutboundRegistrationValues>> = {
  applicant: [{ required: true, message: "请输入申领人" }],
  department: [{ required: true, message: "请输入部门" }],
  purpose: [{ required: true, message: "请输入邮寄用途" }],
  receiver: [{ required: true, whitespace: true, message: "请输入收货人" }],
  shippingAddress: [{ required: true, whitespace: true, message: "请输入收货地址" }],
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
  const form = useControlledForm<Partial<OutboundRegistrationValues>>({
    initialValues: {},
    rules: OUTBOUND_REGISTRATION_RULES,
    onFinish: (values) => void submit(values as OutboundRegistrationValues),
  });
  const quantityIdPrefix = useId();
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

  async function submit(values: OutboundRegistrationValues) {
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
  }

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
                {/* lobe InputNumber puts aria-* on its wrapper; the id reaches the input itself. */}
                <label className="sr-only" htmlFor={`${quantityIdPrefix}-${sample.id}`}>
                  {`${sample.sampleName}出库数量`}
                </label>
                <InputNumber
                  id={`${quantityIdPrefix}-${sample.id}`}
                  className={styles.sampleQuantity}
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

      <form
        className={styles.inlineForm}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          form.submit();
        }}
      >
        <FormField form={form} name="applicant" label="申领人" required>
          <Input {...bindTextField(form, "applicant")} placeholder="姓名" maxLength={120} />
        </FormField>
        <FormField form={form} name="department" label="部门" required>
          <Input {...bindTextField(form, "department")} placeholder="部门名称" maxLength={120} />
        </FormField>
        <FormField form={form} name="purpose" label="邮寄用途" required>
          <Input {...bindTextField(form, "purpose")} placeholder="如：客户演示..." maxLength={1000} />
        </FormField>
        <FormField form={form} name="receiver" label="收货人" required>
          <Input {...bindTextField(form, "receiver")} placeholder="收货人姓名" maxLength={120} />
        </FormField>
        <FormField form={form} name="shippingAddress" label="收货地址" required className={styles.addressField}>
          <Input {...bindTextField(form, "shippingAddress")} placeholder="详细地址" maxLength={1000} />
        </FormField>
        <div className={styles.submitField}>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            disabled={readOnly || selectedIds.length === 0}
          >
            📤 提交出库{selectedIds.length > 0 ? `（${selectedIds.length}）` : ""}
          </Button>
        </div>
      </form>
    </section>
  );
}
