import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Table,
  Upload,
} from "antd";
import type { UploadProps } from "antd";
import { UploadOutlined } from "@ant-design/icons";

import type {
  SampleInventoryInbound,
  SampleInventoryInboundXlsxParseResponse,
  SampleInventorySampleXlsxParseResponse,
  SampleInventorySettings,
} from "@/lib/generated-api-contract";
import {
  compareSampleInventoryNumber,
  compareSampleInventoryText,
  compareSampleInventoryTimestamp,
} from "../_lib/sample-inventory-table-sorters";
import { sampleInventoryTableComponents } from "./sample-inventory-table-cells";
import styles from "../sample-inventory.module.css";

export type SettingsFormValues = {
  lowStockThreshold: number;
};

type SettingsModalProps = {
  open: boolean;
  settings?: SampleInventorySettings;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: SettingsFormValues) => void;
};

export function SettingsModal({
  open,
  settings,
  loading,
  onCancel,
  onSubmit,
}: SettingsModalProps) {
  const [form] = Form.useForm<SettingsFormValues>();
  useEffect(() => {
    if (open && settings) {
      form.setFieldsValue({ lowStockThreshold: settings.lowStockThreshold });
    }
  }, [form, open, settings]);
  return (
    <Modal
      open={open}
      title="样品库存设置"
      okText="保存设置"
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
          label="主品低库存阈值"
          name="lowStockThreshold"
          extra="赠品不参与低库存预警。"
          rules={[{ required: true }]}
        >
          <InputNumber
            min={0}
            precision={0}
            className={styles.fullWidthControl}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export type SampleInventoryImportPreview =
  | { kind: "samples"; data: SampleInventorySampleXlsxParseResponse }
  | { kind: "inbounds"; data: SampleInventoryInboundXlsxParseResponse };

type ImportModalProps = {
  open: boolean;
  kind: "samples" | "inbounds";
  preview?: SampleInventoryImportPreview;
  parsing: boolean;
  importing: boolean;
  onCancel: () => void;
  onParse: (file: File) => void;
  onImport: () => void;
  onDownloadTemplate: () => void;
};

export function SampleInventoryImportModal({
  open,
  kind,
  preview,
  parsing,
  importing,
  onCancel,
  onParse,
  onImport,
  onDownloadTemplate,
}: ImportModalProps) {
  const [fileName, setFileName] = useState<string>();
  useEffect(() => {
    if (!open) setFileName(undefined);
  }, [open]);
  const uploadProps: UploadProps = {
    accept: ".xlsx",
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      setFileName(file.name);
      onParse(file);
      return false;
    },
  };
  const activePreview = preview?.kind === kind ? preview.data : undefined;
  const validCount = activePreview?.validCount ?? 0;
  const invalidCount = activePreview?.invalidCount ?? 0;
  const issueItems = activePreview?.issues.slice(0, 6) ?? [];
  const sampleRows =
    preview?.kind === "samples" ? preview.data.rows.slice(0, 8) : [];
  const inboundRows =
    preview?.kind === "inbounds" ? preview.data.rows.slice(0, 8) : [];

  return (
    <Modal
      open={open}
      title={kind === "samples" ? "导入新增Excel" : "导入入库Excel"}
      okText="确认导入"
      cancelText="取消"
      width={760}
      okButtonProps={{ disabled: validCount === 0 || invalidCount > 0 }}
      confirmLoading={importing}
      onCancel={onCancel}
      onOk={onImport}
      destroyOnHidden
    >
      <div className={styles.importStack}>
        <div className={styles.importActions}>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} loading={parsing}>
              选择 XLSX 文件
            </Button>
          </Upload>
          <Button onClick={onDownloadTemplate}>
            📥 下载{kind === "samples" ? "新增样品" : "批量入库"}模板
          </Button>
        </div>
        {fileName && (
          <span className={styles.mutedText}>当前文件：{fileName}</span>
        )}
        {activePreview && (
          <Alert
            type={invalidCount > 0 ? "warning" : "success"}
            showIcon
            title={`可导入 ${validCount} 行，需修正 ${invalidCount} 行`}
            description={
              issueItems.length > 0 ? (
                <ul className={styles.issueList}>
                  {issueItems.map((issue, index) => (
                    <li key={`${issue.row}-${issue.field}-${index}`}>
                      第 {issue.row} 行 · {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                "服务端已完成表头、字段和数量校验；确认时会再次校验。"
              )
            }
          />
        )}
        {sampleRows.length > 0 && (
          <Table
            rowKey="sampleCode"
            size="small"
            pagination={false}
            sortDirections={["ascend", "descend"]}
            components={sampleInventoryTableComponents}
            dataSource={sampleRows}
            columns={[
              {
                title: "样品编码",
                dataIndex: "sampleCode",
                sorter: (left, right) => compareSampleInventoryText(left.sampleCode, right.sampleCode),
              },
              {
                title: "样品名称",
                dataIndex: "sampleName",
                sorter: (left, right) => compareSampleInventoryText(left.sampleName, right.sampleName),
              },
              {
                title: "分类",
                dataIndex: "category",
                sorter: (left, right) => compareSampleInventoryText(left.category, right.category),
                render: (value) => value || "--",
              },
              {
                title: "期初库存",
                dataIndex: "initialQuantity",
                align: "right",
                sorter: (left, right) =>
                  compareSampleInventoryNumber(left.initialQuantity, right.initialQuantity),
              },
            ]}
          />
        )}
        {inboundRows.length > 0 && (
          <Table
            rowKey={(row, index) => `${row.sampleCode}-${index}`}
            size="small"
            pagination={false}
            sortDirections={["ascend", "descend"]}
            components={sampleInventoryTableComponents}
            dataSource={inboundRows}
            columns={[
              {
                title: "样品编码",
                dataIndex: "sampleCode",
                sorter: (left, right) => compareSampleInventoryText(left.sampleCode, right.sampleCode),
              },
              {
                title: "数量",
                dataIndex: "quantity",
                align: "right",
                sorter: (left, right) => compareSampleInventoryNumber(left.quantity, right.quantity),
              },
              {
                title: "物流单号",
                dataIndex: "trackingNumber",
                sorter: (left, right) => compareSampleInventoryText(left.trackingNumber, right.trackingNumber),
                render: (value) => value || "--",
              },
              {
                title: "入库时间",
                dataIndex: "occurredAt",
                sorter: (left, right) => compareSampleInventoryTimestamp(left.occurredAt, right.occurredAt),
                render: (value) => value || "导入时刻",
              },
            ]}
          />
        )}
      </div>
    </Modal>
  );
}

export type VoidInboundFormValues = {
  reason: string;
};

type VoidInboundModalProps = {
  open: boolean;
  item: SampleInventoryInbound | null;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: VoidInboundFormValues) => void;
};

export function VoidInboundModal({
  open,
  item,
  loading,
  onCancel,
  onSubmit,
}: VoidInboundModalProps) {
  const [form] = Form.useForm<VoidInboundFormValues>();
  return (
    <Modal
      open={open}
      title={item ? `删除入库记录 #${item.id}` : "删除入库记录"}
      okText="确认删除"
      okButtonProps={{ danger: true }}
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      afterClose={() => form.resetFields()}
      destroyOnHidden
    >
      {item && (
        <Alert
          className={styles.modalAlert}
          type="warning"
          showIcon
          title={`删除后将从 ${item.sampleName} 的库存中扣减 ${item.quantity} 件`}
          description="记录会保留审计痕迹；若扣减后在手库存低于已预留库存，服务端会拒绝本次操作。"
        />
      )}
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark="optional"
      >
        <Form.Item
          label="删除原因"
          name="reason"
          rules={[{ required: true, message: "请输入删除原因" }]}
        >
          <Input.TextArea maxLength={500} rows={3} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
