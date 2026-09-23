import { useEffect } from "react";
import { Form, Input, InputNumber, Modal } from "antd";

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

export function SampleFormModal({
  open,
  item,
  loading,
  onCancel,
  onSubmit,
}: SampleFormModalProps) {
  const [form] = Form.useForm<SampleFormValues>();
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(
      item
        ? {
            sampleCode: item.sampleCode,
            sampleName: item.sampleName,
            model: item.model ?? undefined,
            category: item.category ?? undefined,
            remark: item.remark ?? undefined,
            reservedQuantity: item.reservedQuantity,
          }
        : { initialQuantity: 0, reservedQuantity: 0 },
    );
  }, [form, item, open]);

  return (
    <Modal
      open={open}
      title={item ? `编辑样品 · ${item.sampleCode}` : "新建样品"}
      okText={item ? "保存" : "创建"}
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
        <div className={styles.formGrid}>
          <Form.Item
            label="样品编码"
            name="sampleCode"
            rules={[{ required: true, message: "请输入样品编码" }]}
          >
            <Input
              maxLength={120}
              placeholder="支持数字、字母、中文及混合编码"
            />
          </Form.Item>
          <Form.Item
            label="样品名称"
            name="sampleName"
            rules={[{ required: true, message: "请输入样品名称" }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item label="型号" name="model">
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Input maxLength={120} />
          </Form.Item>
          {!item && (
            <Form.Item label="期初库存" name="initialQuantity">
              <InputNumber
                min={0}
                precision={0}
                className={styles.fullWidthControl}
              />
            </Form.Item>
          )}
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const stockQuantity =
                item?.onHandQuantity ??
                Number(getFieldValue("initialQuantity") ?? 0);
              return (
                <Form.Item
                  label="预留"
                  name="reservedQuantity"
                  dependencies={["initialQuantity"]}
                  rules={[
                    {
                      validator: (_, value) => {
                        const quantity = value ?? 0;
                        if (!Number.isInteger(quantity) || quantity < 0) {
                          return Promise.reject(
                            new Error("预留必须是非负整数"),
                          );
                        }
                        if (quantity > stockQuantity) {
                          return Promise.reject(
                            new Error("预留不能超过库存"),
                          );
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <InputNumber
                    min={0}
                    max={stockQuantity}
                    precision={0}
                    className={styles.fullWidthControl}
                    aria-label="预留"
                    onInput={(text) => {
                      const input = text.trim();
                      form.setFieldValue(
                        "reservedQuantity",
                        input === "" ? undefined : Number(input),
                      );
                    }}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>
        </div>
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue }) => {
            const stockQuantity =
              item?.onHandQuantity ??
              Number(getFieldValue("initialQuantity") ?? 0);
            const reservedQuantity = Number(
              getFieldValue("reservedQuantity") ?? 0,
            );
            return (
              <div
                className={`${styles.reservationSummary} ${reservedQuantity > 0 ? styles.reservationSummaryActive : ""}`}
                role="status"
                aria-live="polite"
              >
                库存 {stockQuantity}，保存后可用 {stockQuantity - reservedQuantity}
              </div>
            );
          }}
        </Form.Item>
        <Form.Item label="备注" name="remark">
          <Input.TextArea maxLength={2000} rows={3} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
