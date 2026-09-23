import { CopyOutlined, EditOutlined, FormOutlined } from "@ant-design/icons";
import { App, Button, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";

import { Badge, type BadgeStatus } from "@/components/atoms/badge";
import {
  useSampleInventoryColumnWidths,
  type SampleInventoryColumnWidthDefinition,
} from "../_hooks/use-sample-inventory-column-widths";
import { formatSampleInventoryTimestamp } from "../_lib/sample-inventory-formatters";
import {
  SAMPLE_INVENTORY_PAGE_SIZES,
  normalizeSampleInventoryPageSize,
  type SampleInventoryOutboundStatus,
  type SampleInventoryOutboundView,
  type SampleInventoryPageSize,
} from "../_lib/sample-inventory-types";
import {
  compareSampleInventoryNumber,
  compareSampleInventoryText,
  compareSampleInventoryTimestamp,
} from "../_lib/sample-inventory-table-sorters";
import { SampleInventoryColumnTitle } from "./sample-inventory-column-title";
import { SampleInventoryOutboundRowActions } from "./sample-inventory-outbound-row-actions";
import { sampleInventoryTableComponents } from "./sample-inventory-table-cells";
import styles from "../sample-inventory.module.css";

type OutboundColumnKey =
  | "requestedAt"
  | "sampleCode"
  | "sampleName"
  | "quantity"
  | "applicant"
  | "department"
  | "purpose"
  | "receiver"
  | "address"
  | "tracking"
  | "status"
  | "actions";

const OUTBOUND_COLUMN_WIDTHS = [
  { key: "requestedAt", defaultWidth: 160, minWidth: 110, maxWidth: 260 },
  { key: "sampleCode", defaultWidth: 150, minWidth: 90, maxWidth: 320 },
  { key: "sampleName", defaultWidth: 180, minWidth: 100, maxWidth: 360 },
  { key: "quantity", defaultWidth: 80, minWidth: 50, maxWidth: 160 },
  { key: "applicant", defaultWidth: 110, minWidth: 60, maxWidth: 260 },
  { key: "department", defaultWidth: 130, minWidth: 60, maxWidth: 280 },
  { key: "purpose", defaultWidth: 180, minWidth: 80, maxWidth: 420 },
  { key: "receiver", defaultWidth: 110, minWidth: 70, maxWidth: 240 },
  { key: "address", defaultWidth: 220, minWidth: 100, maxWidth: 480 },
  { key: "tracking", defaultWidth: 170, minWidth: 90, maxWidth: 340 },
  { key: "status", defaultWidth: 100, minWidth: 60, maxWidth: 180 },
  { key: "actions", defaultWidth: 280, minWidth: 220, maxWidth: 420 },
] as const satisfies readonly SampleInventoryColumnWidthDefinition<OutboundColumnKey>[];

const STATUS_LABELS: Record<SampleInventoryOutboundStatus, string> = {
  pending: "待审批",
  approved: "已审批",
  sampled: "已取样",
  rejected: "已驳回",
};

const STATUS_BADGES: Record<SampleInventoryOutboundStatus, BadgeStatus> = {
  pending: "warning",
  approved: "info",
  sampled: "success",
  rejected: "neutral",
};

const STATUS_SORT_ORDER: Record<SampleInventoryOutboundStatus, number> = {
  pending: 0,
  approved: 1,
  sampled: 2,
  rejected: 3,
};

type OutboundTableProps = {
  items: SampleInventoryOutboundView[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  selectedIds: number[];
  resizableColumns: boolean;
  selectableRows?: boolean;
  showActions?: boolean;
  onSelectedIdsChange: (ids: number[]) => void;
  onPaginationChange: (page: number, pageSize: SampleInventoryPageSize) => void;
  onEdit: (item: SampleInventoryOutboundView) => void;
  onEditTracking: (item: SampleInventoryOutboundView) => void;
  onTransition: (item: SampleInventoryOutboundView, target: SampleInventoryOutboundStatus) => void;
  onArchive: (item: SampleInventoryOutboundView) => void;
};

export function OutboundTable({
  items,
  loading,
  total,
  page,
  pageSize,
  selectedIds,
  resizableColumns,
  selectableRows = true,
  showActions = true,
  onSelectedIdsChange,
  onPaginationChange,
  onEdit,
  onEditTracking,
  onTransition,
  onArchive,
}: OutboundTableProps) {
  const { message } = App.useApp();
  const columnWidths = useSampleInventoryColumnWidths("outbound-records", OUTBOUND_COLUMN_WIDTHS);
  const columnTitle = (key: OutboundColumnKey, title: string) =>
    resizableColumns ? (
      <SampleInventoryColumnTitle
        columnKey={key}
        onResizeBy={columnWidths.resizeBy}
        onResizeStart={columnWidths.startResize}
      >
        {title}
      </SampleInventoryColumnTitle>
    ) : (
      title
    );
  const columnWidth = (key: OutboundColumnKey) => {
    const definition = OUTBOUND_COLUMN_WIDTHS.find((column) => column.key === key);
    return resizableColumns ? columnWidths.getWidth(key) : (definition?.defaultWidth ?? 120);
  };
  const columns: ColumnsType<SampleInventoryOutboundView> = [
    {
      title: columnTitle("requestedAt", "时间"),
      dataIndex: "requestedAt",
      fixed: "left",
      width: columnWidth("requestedAt"),
      sorter: (left, right) => compareSampleInventoryTimestamp(left.requestedAt, right.requestedAt),
      render: (value) => <span className={styles.timeText}>{formatSampleInventoryTimestamp(value)}</span>,
    },
    {
      title: columnTitle("sampleCode", "条码"),
      dataIndex: "sampleCode",
      fixed: "left",
      width: columnWidth("sampleCode"),
      sorter: (left, right) => compareSampleInventoryText(left.sampleCode, right.sampleCode),
      render: (value) => <span className={styles.codeText}>{value}</span>,
    },
    {
      title: columnTitle("sampleName", "产品名称"),
      dataIndex: "sampleName",
      fixed: "left",
      width: columnWidth("sampleName"),
      ellipsis: true,
      sorter: (left, right) => compareSampleInventoryText(left.sampleName, right.sampleName),
      render: (value) => <strong title={value}>{value}</strong>,
    },
    {
      title: columnTitle("quantity", "数量"),
      dataIndex: "quantity",
      width: columnWidth("quantity"),
      align: "right",
      className: styles.numericCell,
      sorter: (left, right) => compareSampleInventoryNumber(left.quantity, right.quantity),
    },
    {
      title: columnTitle("applicant", "申领人"),
      dataIndex: "applicant",
      width: columnWidth("applicant"),
      sorter: (left, right) => compareSampleInventoryText(left.applicant, right.applicant),
    },
    {
      title: columnTitle("department", "部门"),
      dataIndex: "department",
      width: columnWidth("department"),
      sorter: (left, right) => compareSampleInventoryText(left.department, right.department),
    },
    {
      title: columnTitle("purpose", "用途"),
      dataIndex: "purpose",
      width: columnWidth("purpose"),
      ellipsis: true,
      sorter: (left, right) => compareSampleInventoryText(left.purpose, right.purpose),
    },
    {
      title: columnTitle("receiver", "收货人"),
      dataIndex: "receiver",
      width: columnWidth("receiver"),
      sorter: (left, right) => compareSampleInventoryText(left.receiver, right.receiver),
      render: (value) => value || "--",
    },
    {
      title: columnTitle("address", "地址"),
      dataIndex: "shippingAddress",
      width: columnWidth("address"),
      sorter: (left, right) => compareSampleInventoryText(left.shippingAddress, right.shippingAddress),
      render: (value: string | null) => {
        if (!value?.trim()) return "--";
        return (
          <span className={styles.addressCell}>
            <span className={styles.addressText} title={value}>{value}</span>
            <Button
              type="link"
              size="small"
              icon={<CopyOutlined aria-hidden="true" />}
              aria-label="复制地址"
              title="复制地址"
              onClick={() => {
                void copyAddress(value).then((copied) => {
                  if (copied) message.success("地址已复制");
                  else message.error("复制失败，请手动复制");
                });
              }}
            >
              复制
            </Button>
          </span>
        );
      },
    },
    {
      title: columnTitle("tracking", "快递单号"),
      dataIndex: "trackingNumber",
      width: columnWidth("tracking"),
      sorter: (left, right) => compareSampleInventoryText(left.trackingNumber, right.trackingNumber),
      render: (value, item) => {
        if (item.status !== "sampled") {
          return value || "--";
        }
        return value ? (
          <Space size={4}>
            <span>{value}</span>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined aria-hidden="true" />}
              aria-label={`修改 ${item.sampleName} 快递单号`}
              title="修改快递单号"
              onClick={() => onEditTracking(item)}
            />
          </Space>
        ) : (
          <Button
            type="link"
            size="small"
            icon={<FormOutlined aria-hidden="true" />}
            onClick={() => onEditTracking(item)}
          >
            填单号
          </Button>
        );
      },
    },
    {
      title: columnTitle("status", "状态"),
      dataIndex: "status",
      width: columnWidth("status"),
      sorter: (left, right) => STATUS_SORT_ORDER[left.status] - STATUS_SORT_ORDER[right.status],
      render: (status: SampleInventoryOutboundStatus) => (
        <Badge status={STATUS_BADGES[status]}>{STATUS_LABELS[status]}</Badge>
      ),
    },
  ];

  if (showActions) {
    columns.push({
      title: columnTitle("actions", "操作"),
      key: "actions",
      fixed: "right",
      width: columnWidth("actions"),
      render: (_, item) => (
        <SampleInventoryOutboundRowActions
          item={item}
          onEdit={onEdit}
          onEditTracking={onEditTracking}
          onTransition={onTransition}
          onArchive={onArchive}
        />
      ),
    });
  }

  const visibleColumnWidths = showActions
    ? OUTBOUND_COLUMN_WIDTHS
    : OUTBOUND_COLUMN_WIDTHS.filter((column) => column.key !== "actions");
  const selectionColumnWidth = selectableRows ? 48 : 0;

  return (
    <div className={styles.tableViewport}>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        components={sampleInventoryTableComponents}
        dataSource={items}
        loading={loading}
        sortDirections={["ascend", "descend"]}
        scroll={{
          x:
            selectionColumnWidth +
            visibleColumnWidths.reduce((totalWidth, column) => totalWidth + columnWidth(column.key), 0),
        }}
        rowSelection={
          selectableRows
            ? {
                selectedRowKeys: selectedIds,
                onChange: (keys) => onSelectedIdsChange(keys.map(Number)),
              }
            : undefined
        }
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [...SAMPLE_INVENTORY_PAGE_SIZES],
          showTotal: (count) => `共 ${count} 条`,
          onChange: (nextPage, nextPageSize) =>
            onPaginationChange(nextPage, normalizeSampleInventoryPageSize(String(nextPageSize))),
        }}
      />
    </div>
  );
}

async function copyAddress(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy copy path for restricted browser contexts.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
