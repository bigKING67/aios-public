import { useEffect, useId, useMemo, useState } from "react";
import { Checkbox, Input, InputNumber, Modal } from "@lobehub/ui";

import { FormField } from "@/components/molecules/form-field";
import { bindTextField, useControlledForm } from "@/hooks/use-controlled-form";

import type { CreateSampleInventoryInboundItem, SampleInventorySample } from "@/lib/generated-api-contract";
import { normalizeSampleInventoryOptionalText } from "../_lib/sample-inventory-formatters";
import { orderSampleInventoryOptions } from "../_lib/sample-inventory-view-options";
import styles from "../sample-inventory.module.css";

type BatchInboundFormValues = {
  operatorName?: string;
  trackingNumber?: string;
  remark?: string;
};

type SampleInventoryBatchInboundDialogProps = {
  open: boolean;
  samples: SampleInventorySample[];
  loading: boolean;
  onCancel: () => void;
  onSubmit: (items: CreateSampleInventoryInboundItem[]) => Promise<void>;
};

export function SampleInventoryBatchInboundDialog({
  open,
  samples,
  loading,
  onCancel,
  onSubmit,
}: SampleInventoryBatchInboundDialogProps) {
  const form = useControlledForm<BatchInboundFormValues>({
    initialValues: {},
    onFinish: (values) => void submit(values),
  });
  const samplesLabelId = useId();
  const [selectedSampleIds, setSelectedSampleIds] = useState<number[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [selectionError, setSelectionError] = useState<string>();
  const orderedSamples = useMemo(() => orderSampleInventoryOptions(samples), [samples]);

  const toggleSample = (sampleId: number, checked: boolean) => {
    setSelectionError(undefined);
    setSelectedSampleIds((current) =>
      checked ? [...current, sampleId] : current.filter((id) => id !== sampleId),
    );
    setQuantities((current) => {
      if (checked) return { ...current, [sampleId]: current[sampleId] ?? 1 };
      const next = { ...current };
      delete next[sampleId];
      return next;
    });
  };

  // Each opening starts with nothing selected.
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setSelectedSampleIds([]);
    setQuantities({});
    setSelectionError(undefined);
  }, [form, open]);

  async function submit(values: BatchInboundFormValues) {
    if (selectedSampleIds.length === 0) {
      setSelectionError("请至少选择一个样品");
      return;
    }
    const selectedItems = [...selectedSampleIds]
      .sort((left, right) => left - right)
      .map((sampleId) => ({ sampleId, quantity: quantities[sampleId] ?? 0 }));
    if (selectedItems.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      setSelectionError("请为每个已选样品填写有效的入库数量");
      return;
    }
    const common = {
      operatorName: normalizeSampleInventoryOptionalText(values.operatorName),
      trackingNumber: normalizeSampleInventoryOptionalText(values.trackingNumber),
      remark: normalizeSampleInventoryOptionalText(values.remark),
      occurredAt: undefined,
    };
    try {
      await onSubmit(selectedItems.map((item) => ({ ...item, ...common })));
    } catch {
      // The mutation keeps the dialog state and owns user-visible feedback.
    }
  }

  return (
    <Modal
      open={open}
      title="📥 批量入库"
      width={760}
      okText="确认批量入库"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <div className={styles.batchSampleField}>
        <span id={samplesLabelId} className={styles.batchSampleLabel}>
          选择样品并填写各自入库数量 *
        </span>
        <div className={styles.batchSampleOptions} role="group" aria-labelledby={samplesLabelId}>
          {orderedSamples.map((sample) => {
            const selected = selectedSampleIds.includes(sample.id);
            return (
              <div key={sample.id} className={styles.batchSampleOption}>
                <Checkbox checked={selected} onChange={(checked) => toggleSample(sample.id, checked)}>
                  <span className={styles.batchSampleIdentity}>
                    <strong>{sample.sampleName}</strong>
                    <span>{sample.sampleCode} · 当前库存 {sample.onHandQuantity}</span>
                  </span>
                </Checkbox>
                {/* lobe InputNumber puts aria-* on its wrapper; the id reaches the input itself. */}
                <label className="sr-only" htmlFor={`${samplesLabelId}-${sample.id}`}>
                  {`${sample.sampleName}入库数量`}
                </label>
                <InputNumber
                  id={`${samplesLabelId}-${sample.id}`}
                  min={1}
                  precision={0}
                  value={quantities[sample.id] ?? 1}
                  disabled={!selected}
                  onChange={(value) => {
                    setQuantities((current) => ({
                      ...current,
                      [sample.id]: Math.max(1, Math.trunc(Number(value) || 1)),
                    }));
                    setSelectionError(undefined);
                  }}
                />
              </div>
            );
          })}
        </div>
        {selectionError ? (
          <div className={styles.batchSampleError} role="alert">
            {selectionError}
          </div>
        ) : null}
      </div>
      <div className={styles.batchInboundFields}>
        <FormField form={form} name="operatorName" label="操作人">
          <Input {...bindTextField(form, "operatorName")} maxLength={120} placeholder="姓名" />
        </FormField>
        <FormField form={form} name="trackingNumber" label="快递单号">
          <Input {...bindTextField(form, "trackingNumber")} maxLength={200} placeholder="快递单号" />
        </FormField>
      </div>
      <FormField form={form} name="remark" label="备注">
        <Input {...bindTextField(form, "remark")} maxLength={2000} placeholder="入库备注" />
      </FormField>
    </Modal>
  );
}
