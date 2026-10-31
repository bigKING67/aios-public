import { useEffect, useMemo } from "react";
import { Input, InputNumber, Modal, TextArea } from "@lobehub/ui";

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
  SampleInventoryOutbound,
  SampleInventorySample,
} from "@/lib/generated-api-contract";
import styles from "../sample-inventory.module.css";

export {
  SampleFormModal,
  type SampleFormValues,
} from "./sample-inventory-sample-form-modal";

export type InboundFormValues = {
  sampleId: number;
  quantity: number;
  trackingNumber?: string;
  operatorName?: string;
  remark?: string;
};

type InboundFormModalProps = {
  open: boolean;
  samples: SampleInventorySample[];
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: InboundFormValues) => void;
};

const INBOUND_RULES: ControlledFormRules<Partial<InboundFormValues>> = {
  sampleId: [{ required: true, message: "请选择样品" }],
  quantity: [{ required: true, message: "请输入数量" }],
};

export function InboundFormModal({
  open,
  samples,
  loading,
  onCancel,
  onSubmit,
}: InboundFormModalProps) {
  const form = useControlledForm<Partial<InboundFormValues>>({
    initialValues: {},
    rules: INBOUND_RULES,
    onFinish: (values) => onSubmit(values as InboundFormValues),
  });
  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);
  const sampleOptions = useMemo(
    () =>
      samples.map((sample) => ({
        value: sample.id,
        label: `${sample.sampleCode} · ${sample.sampleName}`,
      })),
    [samples],
  );
  return (
    <Modal
      open={open}
      title="登记入库"
      okText="确认入库"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <FormField form={form} name="sampleId" label="样品" required>
        <LabeledSelect
          {...bindSelectField(form, "sampleId")}
          showSearch
          options={sampleOptions}
          placeholder="按编码或名称查找"
        />
      </FormField>
      <div className={styles.formGrid}>
        <FormField form={form} name="quantity" label="数量" required>
          <InputNumber {...bindNumberField(form, "quantity")} min={1} precision={0} className={styles.fullWidthControl} />
        </FormField>
        <FormField form={form} name="operatorName" label="操作人">
          <Input {...bindTextField(form, "operatorName")} maxLength={120} />
        </FormField>
        <FormField form={form} name="trackingNumber" label="物流单号">
          <Input {...bindTextField(form, "trackingNumber")} maxLength={200} />
        </FormField>
      </div>
      <FormField form={form} name="remark" label="备注">
        <TextArea {...bindTextField(form, "remark")} maxLength={2000} rows={3} showCount />
      </FormField>
    </Modal>
  );
}

export type OutboundFormValues = {
  sampleId: number;
  quantity: number;
  applicant: string;
  department: string;
  purpose: string;
  receiver: string;
  shippingAddress: string;
  trackingNumber?: string;
};

type OutboundFormModalProps = {
  open: boolean;
  item: SampleInventoryOutbound | null;
  samples: SampleInventorySample[];
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: OutboundFormValues) => void;
};

const OUTBOUND_RULES: ControlledFormRules<Partial<OutboundFormValues>> = {
  sampleId: [{ required: true, message: "请选择样品" }],
  quantity: [{ required: true, message: "请输入数量" }],
  applicant: [{ required: true, message: "请输入申请人" }],
  department: [{ required: true, message: "请输入部门" }],
  receiver: [{ required: true, whitespace: true, message: "请输入收货人" }],
  purpose: [{ required: true, message: "请输入用途" }],
  shippingAddress: [{ required: true, whitespace: true, message: "请输入收货地址" }],
};

export function OutboundFormModal({
  open,
  item,
  samples,
  loading,
  onCancel,
  onSubmit,
}: OutboundFormModalProps) {
  const form = useControlledForm<Partial<OutboundFormValues>>({
    initialValues: item
      ? {
          sampleId: item.sampleId,
          quantity: item.quantity,
          applicant: item.applicant,
          department: item.department,
          purpose: item.purpose,
          receiver: item.receiver ?? "",
          shippingAddress: item.shippingAddress ?? "",
          trackingNumber: item.trackingNumber ?? undefined,
        }
      : {},
    rules: OUTBOUND_RULES,
    onFinish: (values) => onSubmit(values as OutboundFormValues),
  });
  useEffect(() => {
    if (open) form.resetFields();
  }, [form, item, open]);
  const sampleOptions = useMemo(
    () =>
      samples.map((sample) => ({
        value: sample.id,
        label: `${sample.sampleCode} · ${sample.sampleName}（可用 ${sample.availableQuantity}）`,
      })),
    [samples],
  );
  return (
    <Modal
      open={open}
      title={item ? `编辑领用申请 #${item.id}` : "新建领用申请"}
      okText={item ? "保存" : "提交申请"}
      cancelText="取消"
      width={680}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <div className={styles.formGrid}>
        <FormField form={form} name="sampleId" label="样品" required>
          <LabeledSelect {...bindSelectField(form, "sampleId")} showSearch options={sampleOptions} />
        </FormField>
        <FormField form={form} name="quantity" label="数量" required>
          <InputNumber {...bindNumberField(form, "quantity")} min={1} precision={0} className={styles.fullWidthControl} />
        </FormField>
        <FormField form={form} name="applicant" label="申请人" required>
          <Input {...bindTextField(form, "applicant")} maxLength={120} />
        </FormField>
        <FormField form={form} name="department" label="部门" required>
          <Input {...bindTextField(form, "department")} maxLength={120} />
        </FormField>
        <FormField form={form} name="receiver" label="收货人" required>
          <Input {...bindTextField(form, "receiver")} maxLength={120} />
        </FormField>
        <FormField form={form} name="trackingNumber" label="物流单号">
          <Input {...bindTextField(form, "trackingNumber")} maxLength={200} />
        </FormField>
      </div>
      <FormField form={form} name="purpose" label="用途" required>
        <TextArea {...bindTextField(form, "purpose")} maxLength={1000} rows={3} showCount />
      </FormField>
      <FormField form={form} name="shippingAddress" label="收货地址" required>
        <TextArea {...bindTextField(form, "shippingAddress")} maxLength={1000} rows={2} showCount />
      </FormField>
    </Modal>
  );
}
