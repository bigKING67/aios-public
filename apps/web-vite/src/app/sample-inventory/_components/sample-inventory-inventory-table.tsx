import { ControlOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Table, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";

import { Badge } from "@/components/atoms/badge";
import type { SampleInventorySample } from "@/lib/generated-api-contract";
import {
  useSampleInventoryColumnWidths,
  type SampleInventoryColumnWidthDefinition,
} from "../_hooks/use-sample-inventory-column-widths";
import { formatSampleInventoryTimestamp } from "../_lib/sample-inventory-formatters";
import {
  SAMPLE_INVENTORY_PAGE_SIZES,
  normalizeSampleInventoryPageSize,
  type SampleInventoryPageSize,
} from "../_lib/sample-inventory-types";
import {
  compareSampleInventoryNumber,
  compareSampleInventoryText,
  compareSampleInventoryTimestamp,
} from "../_lib/sample-inventory-table-sorters";
import { SampleInventoryColumnTitle } from "./sample-inventory-column-title";
import { sampleInventoryTableComponents } from "./sample-inventory-table-cells";
import styles from "../sample-inventory.module.css";

type InventoryColumnKey =
  | "sampleCode"
  | "sampleName"
  | "model"
  | "productKind"
  | "onHand"
  | "reserved"
  | "available"
  | "updatedAt"
  | "actions";

const INVENTORY_COLUMN_WIDTHS = [
  { key: "sampleCode", defaultWidth: 150, minWidth: 90, maxWidth: 320 },
  { key: "sampleName", defaultWidth: 190, minWidth: 100, maxWidth: 420 },
  { key: "model", defaultWidth: 150, minWidth: 80, maxWidth: 320 },
  { key: "productKind", defaultWidth: 110, minWidth: 80, maxWidth: 180 },
  { key: "onHand", defaultWidth: 100, minWidth: 70, maxWidth: 160 },
  { key: "reserved", defaultWidth: 100, minWidth: 70, maxWidth: 160 },
  { key: "available", defaultWidth: 110, minWidth: 60, maxWidth: 180 },
  { key: "updatedAt", defaultWidth: 170, minWidth: 120, maxWidth: 280 },
  { key: "actions", defaultWidth: 230, minWidth: 180, maxWidth: 340 },
] as const satisfies readonly SampleInventoryColumnWidthDefinition<InventoryColumnKey>[];

type InventoryTableProps = {
  items: SampleInventorySample[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  onPaginationChange: (page: number, pageSize: SampleInventoryPageSize) => void;
  onEdit: (item: SampleInventorySample) => void;
  onAdjust: (item: SampleInventorySample) => void;
  onArchive: (item: SampleInventorySample) => void;
};

export function InventoryTable({
  items,
  loading,
  total,
  page,
  pageSize,
  selectedIds,
  onSelectedIdsChange,
  onPaginationChange,
  onEdit,
  onAdjust,
  onArchive,
}: InventoryTableProps) {
  const columnWidths = useSampleInventoryColumnWidths("inventory", INVENTORY_COLUMN_WIDTHS);
  const columnTitle = (key: InventoryColumnKey, title: string) => (
    <SampleInventoryColumnTitle
      columnKey={key}
      onResizeBy={columnWidths.resizeBy}
      onResizeStart={columnWidths.startResize}
    >
      {title}
    </SampleInventoryColumnTitle>
  );
  const columns: ColumnsType<SampleInventorySample> = [
    {
      title: columnTitle("sampleCode", "条码"),
      dataIndex: "sampleCode",
      fixed: "left",
      width: columnWidths.getWidth("sampleCode"),
      sorter: (left, right) => compareSampleInventoryText(left.sampleCode, right.sampleCode),
      render: (value) => <span className={styles.codeText}>{value}</span>,
    },
    {
      title: columnTitle("sampleName", "产品名称"),
      dataIndex: "sampleName",
      fixed: "left",
      width: columnWidths.getWidth("sampleName"),
      ellipsis: true,
      sorter: (left, right) => compareSampleInventoryText(left.sampleName, right.sampleName),
      render: (value) => <strong title={value}>{value}</strong>,
    },
    {
      title: columnTitle("model", "型号"),
      dataIndex: "model",
      width: columnWidths.getWidth("model"),
      sorter: (left, right) => compareSampleInventoryText(left.model, right.model),
      render: (value) => value || "--",
    },
    {
      title: columnTitle("productKind", "类别"),
      dataIndex: "productKind",
      width: columnWidths.getWidth("productKind"),
      sorter: (left, right) => compareSampleInventoryText(left.productKind, right.productKind),
      render: (value) =>
        value === "primary" ? (
          <Badge status="info">主品</Badge>
        ) : (
          <Badge status="neutral">赠品</Badge>
        ),
    },
    {
      title: columnTitle("onHand", "库存"),
      dataIndex: "onHandQuantity",
      width: columnWidths.getWidth("onHand"),
      align: "right",
      sorter: (left, right) =>
        compareSampleInventoryNumber(left.onHandQuantity, right.onHandQuantity),
      render: (value) => <span className={styles.numericCell}>{value}</span>,
    },
    {
      title: columnTitle("reserved", "预留"),
      dataIndex: "reservedQuantity",
      width: columnWidths.getWidth("reserved"),
      align: "right",
      sorter: (left, right) =>
        compareSampleInventoryNumber(left.reservedQuantity, right.reservedQuantity),
      render: (value) => (
        <span
          className={`${styles.numericCell} ${value > 0 ? styles.reservedQuantity : styles.mutedText}`}
        >
          {value}
        </span>
      ),
    },
    {
      title: columnTitle("available", "可用"),
      key: "available",
      width: columnWidths.getWidth("available"),
      align: "right",
      sorter: (left, right) =>
        compareSampleInventoryNumber(left.availableQuantity, right.availableQuantity),
      render: (_, item) =>
        item.isLowStock ? (
          <Badge status="warning">{item.availableQuantity}</Badge>
        ) : (
          <span className={styles.numericCell}>{item.availableQuantity}</span>
        ),
    },
    {
      title: columnTitle("updatedAt", "更新时间"),
      dataIndex: "updatedAt",
      width: columnWidths.getWidth("updatedAt"),
      sorter: (left, right) => compareSampleInventoryTimestamp(left.updatedAt, right.updatedAt),
      render: (value) => <span className={styles.timeText}>{formatSampleInventoryTimestamp(value)}</span>,
    },
    {
      title: columnTitle("actions", "操作"),
      key: "actions",
      fixed: "right",
      width: columnWidths.getWidth("actions"),
      render: (_, item) => {
        const archiveDisabled = item.onHandQuantity !== 0 || item.reservedQuantity !== 0;
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined aria-hidden="true" />}
              onClick={() => onEdit(item)}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              icon={<ControlOutlined aria-hidden="true" />}
              onClick={() => onAdjust(item)}
            >
              调整
            </Button>
            <Popconfirm
              title="归档样品"
              description="仅零库存且无预留的样品可归档。"
              okText="归档"
              cancelText="取消"
              onConfirm={() => onArchive(item)}
              disabled={archiveDisabled}
            >
              <Tooltip title={archiveDisabled ? "请先清零库存和预留" : undefined}>
                <Button
                  danger
                  type="link"
                  size="small"
                  icon={<DeleteOutlined aria-hidden="true" />}
                  disabled={archiveDisabled}
                >
                  归档
                </Button>
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

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
          x: Math.max(
            1280,
            48 +
              INVENTORY_COLUMN_WIDTHS.reduce((totalWidth, column) => totalWidth + columnWidths.getWidth(column.key), 0),
          ),
        }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: (keys) => onSelectedIdsChange(keys.map(Number)),
          getCheckboxProps: (item) => ({
            disabled: item.onHandQuantity !== 0 || item.reservedQuantity !== 0,
          }),
        }}
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
