import { useEffect } from "react";
import { Input, Modal } from "@lobehub/ui";

import { FormField } from "@/components/molecules/form-field";
import { bindTextField, type ControlledFormRules, useControlledForm } from "@/hooks/use-controlled-form";

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

const TRACKING_RULES: ControlledFormRules<TrackingFormValues> = {
  trackingNumber: [
    { required: true, whitespace: true, message: "请输入快递单号" },
    { validator: (value) => String(value).length <= 200, message: "快递单号不能超过 200 个字符" },
  ],
};

export function SampleInventoryTrackingDialog({
  item,
  loading,
  onCancel,
  onSubmit,
}: SampleInventoryTrackingDialogProps) {
  const form = useControlledForm<TrackingFormValues>({
    initialValues: { trackingNumber: item?.trackingNumber ?? "" },
    rules: TRACKING_RULES,
    onFinish: (values) => onSubmit(values.trackingNumber.trim()),
  });

  useEffect(() => {
    if (item !== undefined) form.resetFields();
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
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          form.submit();
        }}
      >
        <FormField form={form} name="trackingNumber" label="快递单号" required>
          <Input {...bindTextField(form, "trackingNumber")} autoFocus maxLength={200} placeholder="请输入新的快递单号" />
        </FormField>
      </form>
    </Modal>
  );
}
