import { useEffect, useMemo } from "react";
import { Form, Input, InputNumber, Modal, Select } from "antd";

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

export function InboundFormModal({
  open,
  samples,
  loading,
  onCancel,
  onSubmit,
}: InboundFormModalProps) {
  const [form] = Form.useForm<InboundFormValues>();
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
      afterClose={() => form.resetFields()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark="optional"
      >
        <Form.Item
          label="样品"
          name="sampleId"
          rules={[{ required: true, message: "请选择样品" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={sampleOptions}
            placeholder="按编码或名称查找"
          />
        </Form.Item>
        <div className={styles.formGrid}>
          <Form.Item
            label="数量"
            name="quantity"
            rules={[{ required: true, message: "请输入数量" }]}
          >
            <InputNumber
              min={1}
              precision={0}
              className={styles.fullWidthControl}
            />
          </Form.Item>
          <Form.Item label="操作人" name="operatorName">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item label="物流单号" name="trackingNumber">
            <Input maxLength={200} />
          </Form.Item>
        </div>
        <Form.Item label="备注" name="remark">
          <Input.TextArea maxLength={2000} rows={3} showCount />
        </Form.Item>
      </Form>
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

export function OutboundFormModal({
  open,
  item,
  samples,
  loading,
  onCancel,
  onSubmit,
}: OutboundFormModalProps) {
  const [form] = Form.useForm<OutboundFormValues>();
  useEffect(() => {
    if (!open || !item) return;
    form.setFieldsValue({
      sampleId: item.sampleId,
      quantity: item.quantity,
      applicant: item.applicant,
      department: item.department,
      purpose: item.purpose,
      receiver: item.receiver ?? "",
      shippingAddress: item.shippingAddress ?? "",
      trackingNumber: item.trackingNumber ?? undefined,
    });
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
      afterClose={() => form.resetFields()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark="optional"
      >
        <div className={styles.formGrid}>
          <Form.Item
            label="样品"
            name="sampleId"
            rules={[{ required: true, message: "请选择样品" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={sampleOptions}
            />
          </Form.Item>
          <Form.Item
            label="数量"
            name="quantity"
            rules={[{ required: true, message: "请输入数量" }]}
          >
            <InputNumber
              min={1}
              precision={0}
              className={styles.fullWidthControl}
            />
          </Form.Item>
          <Form.Item
            label="申请人"
            name="applicant"
            rules={[{ required: true, message: "请输入申请人" }]}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            label="部门"
            name="department"
            rules={[{ required: true, message: "请输入部门" }]}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            label="收货人"
            name="receiver"
            rules={[{ required: true, whitespace: true, message: "请输入收货人" }]}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item label="物流单号" name="trackingNumber">
            <Input maxLength={200} />
          </Form.Item>
        </div>
        <Form.Item
          label="用途"
          name="purpose"
          rules={[{ required: true, message: "请输入用途" }]}
        >
          <Input.TextArea maxLength={1000} rows={3} showCount />
        </Form.Item>
        <Form.Item
          label="收货地址"
          name="shippingAddress"
          rules={[{ required: true, whitespace: true, message: "请输入收货地址" }]}
        >
          <Input.TextArea maxLength={1000} rows={2} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
