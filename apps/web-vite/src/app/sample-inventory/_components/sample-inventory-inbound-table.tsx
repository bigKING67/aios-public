import { DeleteOutlined } from "@ant-design/icons";
import { Badge } from "@/components/atoms/badge";
import type { SampleInventoryInbound } from "@/lib/generated-api-contract";
import { Button, Table } from "antd";
import type { ColumnsType } from "antd/es/table";

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
import { sampleInventoryTableComponents } from "./sample-inventory-table-cells";
import styles from "../sample-inventory.module.css";

type SampleInventoryInboundTableProps = {
  items: SampleInventoryInbound[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  selectedIds: number[];
  selectableRows?: boolean;
  showActions?: boolean;
  onSelectedIdsChange: (ids: number[]) => void;
  onPaginationChange: (page: number, pageSize: SampleInventoryPageSize) => void;
  onDelete: (item: SampleInventoryInbound) => void;
};

export function SampleInventoryInboundTable({
  items,
  loading,
  total,
  page,
  pageSize,
  selectedIds,
  selectableRows = true,
  showActions = true,
  onSelectedIdsChange,
  onPaginationChange,
  onDelete,
}: SampleInventoryInboundTableProps) {
  const columns: ColumnsType<SampleInventoryInbound> = [
    {
      title: "条码",
      dataIndex: "sampleCode",
      fixed: "left",
      width: 150,
      sorter: (left, right) => compareSampleInventoryText(left.sampleCode, right.sampleCode),
      render: (value) => <span className={styles.codeText}>{value}</span>,
    },
    {
      title: "产品名称",
      dataIndex: "sampleName",
      fixed: "left",
      width: 190,
      ellipsis: true,
      sorter: (left, right) => compareSampleInventoryText(left.sampleName, right.sampleName),
      render: (value) => <strong title={value}>{value}</strong>,
    },
    {
      title: "数量",
      dataIndex: "quantity",
      width: 90,
      align: "right",
      className: styles.numericCell,
      sorter: (left, right) => compareSampleInventoryNumber(left.quantity, right.quantity),
    },
    {
      title: "操作人",
      dataIndex: "operatorName",
      width: 120,
      sorter: (left, right) => compareSampleInventoryText(left.operatorName, right.operatorName),
      render: (value) => value || "--",
    },
    {
      title: "物流单号",
      dataIndex: "trackingNumber",
      width: 170,
      sorter: (left, right) => compareSampleInventoryText(left.trackingNumber, right.trackingNumber),
      render: (value) => value || "--",
    },
    {
      title: "备注",
      dataIndex: "remark",
      width: 240,
      ellipsis: true,
      sorter: (left, right) => compareSampleInventoryText(left.remark, right.remark),
      render: (value) => value || "--",
    },
    {
      title: "入库时间",
      dataIndex: "occurredAt",
      width: 180,
      sorter: (left, right) => compareSampleInventoryTimestamp(left.occurredAt, right.occurredAt),
      render: (value) => <span className={styles.timeText}>{formatSampleInventoryTimestamp(value)}</span>,
    },
    {
      title: "状态",
      key: "status",
      width: 100,
      sorter: (left, right) => Number(Boolean(left.voidedAt)) - Number(Boolean(right.voidedAt)),
      render: (_, item) =>
        item.voidedAt ? <Badge status="neutral">已作废</Badge> : <Badge status="success">有效</Badge>,
    },
  ];

  if (showActions) {
    columns.push({
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 100,
      align: "center",
      render: (_, item) =>
        item.voidedAt ? (
          "--"
        ) : (
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined aria-hidden="true" />}
            onClick={() => onDelete(item)}
          >
            删除
          </Button>
        ),
    });
  }

  const tableWidth = 1240 + (selectableRows ? 48 : 0) + (showActions ? 100 : 0);

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
        scroll={{ x: tableWidth }}
        rowSelection={
          selectableRows
            ? {
                selectedRowKeys: selectedIds,
                onChange: (keys) => onSelectedIdsChange(keys.map(Number)),
                getCheckboxProps: (item) => ({
                  disabled: Boolean(item.voidedAt),
                }),
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
