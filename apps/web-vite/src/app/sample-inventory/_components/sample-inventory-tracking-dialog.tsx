import { useEffect } from "react";
import { Form, Input, Modal } from "antd";

import type { SampleInventoryOutboundView } from "../_lib/sample-inventory-types";

type SampleInventoryTrackingDialogProps = {
  item?: SampleInventoryOutboundView | null;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (trackingNumber: string) => void;
};

type TrackingFormValues = {
  trackingNumber: string;
};

export function SampleInventoryTrackingDialog({
  item,
  loading,
  onCancel,
  onSubmit,
}: SampleInventoryTrackingDialogProps) {
  const [form] = Form.useForm<TrackingFormValues>();

  useEffect(() => {
    if (item !== undefined) {
      form.setFieldsValue({ trackingNumber: item?.trackingNumber ?? "" });
    }
  }, [form, item]);

  return (
    <Modal
      open={item !== undefined}
      title={item?.trackingNumber ? "修改快递单号" : "填写快递单号"}
      okText="保存"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
      onCancel={onCancel}
      onOk={() => form.submit()}
    >
      <Form<TrackingFormValues>
        form={form}
        layout="vertical"
        preserve={false}
        onFinish={(values) => onSubmit(values.trackingNumber.trim())}
      >
        <Form.Item
          label="快递单号"
          name="trackingNumber"
          rules={[
            { required: true, whitespace: true, message: "请输入快递单号" },
            { max: 200, message: "快递单号不能超过 200 个字符" },
          ]}
        >
          <Input autoFocus maxLength={200} placeholder="请输入新的快递单号" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
