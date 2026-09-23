import { Button, Input, Popconfirm, Select } from "antd";

import type { SampleInventoryDownloadKind } from "../_lib/sample-inventory-downloads";
import type {
  SampleInventoryOutboundFilter,
  SampleInventoryOutboundStatus,
  SampleInventoryProductKind,
  SampleInventorySortOrder,
  SampleInventoryStockStatus,
  SampleInventoryUrlState,
} from "../_lib/sample-inventory-types";
import styles from "../sample-inventory-workspace.module.css";

type SampleInventoryWorkspaceToolbarProps = {
  state: SampleInventoryUrlState;
  searchDraft: string;
  outboundStatusOptions: Array<{
    value: SampleInventoryOutboundStatus;
    label: string;
  }>;
  selectedSampleCount: number;
  selectedOutboundCount: number;
  backupDownloading: boolean;
  onSearchDraftChange: (value: string) => void;
  onSearch: () => void;
  onStatusChange: (status?: SampleInventoryOutboundFilter) => void;
  onStockStatusChange: (status: SampleInventoryStockStatus) => void;
  onProductKindChange: (kind: SampleInventoryProductKind) => void;
  onInventorySortChange: (sortOrder: SampleInventorySortOrder) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onOpenSettings: () => void;
  onOpenSample: () => void;
  onOpenImport: (kind: "samples" | "inbounds") => void;
  onBatchArchiveSamples: () => void;
  onBatchArchiveOutbounds: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onDownload: (kind: SampleInventoryDownloadKind) => void;
};

export function SampleInventoryWorkspaceToolbar(props: SampleInventoryWorkspaceToolbarProps) {
  const { state } = props;

  if (state.tab === "inventory") {
    return (
      <div className={styles.toolbar}>
        <Input.Search
          className={styles.searchInput}
          allowClear
          value={props.searchDraft}
          placeholder="🔍 搜索编号/名称/规格..."
          onChange={(event) => props.onSearchDraftChange(event.target.value)}
          onSearch={props.onSearch}
        />
        <Select
          className={styles.stockFilter}
          value={state.productKind}
          aria-label="类别"
          onChange={props.onProductKindChange}
          options={[
            { value: "all", label: "全部类别" },
            { value: "primary", label: "主品" },
            { value: "gift", label: "赠品" },
          ]}
        />
        <Select
          className={styles.stockFilter}
          value={state.stockStatus}
          aria-label="库存状态"
          onChange={props.onStockStatusChange}
          options={[
            { value: "all", label: "全部库存" },
            { value: "in_stock", label: "有库存" },
            { value: "low", label: "主品低库存" },
            { value: "out", label: "已出空" },
          ]}
        />
        <Button
          type={state.sortOrder === "asc" ? "primary" : "default"}
          onClick={() => props.onInventorySortChange("asc")}
        >
          📈 可用升序
        </Button>
        <Button
          type={state.sortOrder === "desc" ? "primary" : "default"}
          onClick={() => props.onInventorySortChange("desc")}
        >
          📉 可用降序
        </Button>
        <Button
          type={state.sortOrder === "default" ? "primary" : "default"}
          onClick={() => props.onInventorySortChange("default")}
        >
          ↕ 默认
        </Button>
        <Button onClick={props.onOpenSample}>＋ 新增</Button>
        <Button onClick={() => props.onOpenImport("samples")}>📥 导入新增Excel</Button>
        <Button onClick={() => props.onDownload("sample-export")}>📊 导出Excel</Button>
        <Button loading={props.backupDownloading} onClick={props.onBackup}>
          📤 备份
        </Button>
        <Button onClick={props.onRestore}>📥 恢复</Button>
        <Button onClick={props.onOpenSettings}>⚙ 主品预警阈值</Button>
        <Popconfirm
          title={`归档已选择的 ${props.selectedSampleCount} 个样品？`}
          description="仅零库存且无预留的样品可归档。"
          okText="归档"
          cancelText="取消"
          onConfirm={props.onBatchArchiveSamples}
          disabled={props.selectedSampleCount === 0}
        >
          <Button danger disabled={props.selectedSampleCount === 0}>
            🗑 批量删除
          </Button>
        </Popconfirm>
        <span className={styles.toolbarHint}>勾选左侧复选框后删除</span>
      </div>
    );
  }

  if (state.tab === "outbound-records" || (state.tab === "outbound" && state.status === "all")) {
    const showStatusFilter = state.tab === "outbound-records";
    const showBatchDelete = state.tab === "outbound";
    return (
      <div className={styles.toolbar}>
        <Input.Search
          className={styles.searchInput}
          allowClear
          value={props.searchDraft}
          placeholder="🔍 搜索样品/申领人/部门..."
          onChange={(event) => props.onSearchDraftChange(event.target.value)}
          onSearch={props.onSearch}
        />
        {showStatusFilter && (
          <Select
            className={styles.statusSelect}
            allowClear
            value={state.status === "all" ? undefined : state.status}
            placeholder="全部状态"
            onChange={props.onStatusChange}
            options={props.outboundStatusOptions}
          />
        )}
        <div className={styles.dateGroup}>
          <span>从</span>
          <Input
            className={styles.dateInput}
            type="date"
            aria-label="出库记录开始日期"
            value={state.dateFrom}
            onChange={(event) => props.onDateFromChange(event.target.value)}
          />
          <span>至</span>
          <Input
            className={styles.dateInput}
            type="date"
            aria-label="出库记录结束日期"
            value={state.dateTo}
            onChange={(event) => props.onDateToChange(event.target.value)}
          />
        </div>
        <Button onClick={() => props.onDownload("outbound-export")}>📊 导出Excel</Button>
        {showBatchDelete && (
          <>
            <Popconfirm
              title={`删除已选择的 ${props.selectedOutboundCount} 条出库记录？`}
              description="已审批或已取样记录会通过补偿流水恢复对应库存。"
              okText="确认删除"
              cancelText="取消"
              disabled={props.selectedOutboundCount === 0}
              onConfirm={props.onBatchArchiveOutbounds}
            >
              <Button danger disabled={props.selectedOutboundCount === 0}>
                🗑 批量删除
              </Button>
            </Popconfirm>
            <span className={styles.toolbarHint}>勾选左侧复选框后删除</span>
          </>
        )}
      </div>
    );
  }

  if (state.tab !== "inbound-records") return null;

  return (
    <div className={styles.toolbar}>
      <Input.Search
        className={styles.searchInput}
        allowClear
        value={props.searchDraft}
        placeholder="🔍 搜索样品/操作人..."
        onChange={(event) => props.onSearchDraftChange(event.target.value)}
        onSearch={props.onSearch}
      />
      <div className={styles.dateGroup}>
        <span>从</span>
        <Input
          className={styles.dateInput}
          type="date"
          aria-label="入库记录开始日期"
          value={state.dateFrom}
          onChange={(event) => props.onDateFromChange(event.target.value)}
        />
        <span>至</span>
        <Input
          className={styles.dateInput}
          type="date"
          aria-label="入库记录结束日期"
          value={state.dateTo}
          onChange={(event) => props.onDateToChange(event.target.value)}
        />
      </div>
      <Button onClick={() => props.onDownload("inbound-export")}>📊 导出Excel</Button>
    </div>
  );
}
