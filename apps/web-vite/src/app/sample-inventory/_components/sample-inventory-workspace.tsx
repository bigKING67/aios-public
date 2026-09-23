import { type ReactNode, useState } from "react";
import { ExportOutlined, FileTextOutlined, ImportOutlined, InboxOutlined } from "@ant-design/icons";
import { Alert } from "antd";

import type {
  CreateSampleInventoryInboundItem,
  CreateSampleInventoryOutboundBatchRequest,
  SampleInventoryInbound,
  SampleInventorySample,
  SampleInventorySummary,
} from "@/lib/generated-api-contract";
import type {
  SampleInventoryOutboundStatus,
  SampleInventoryOutboundFilter,
  SampleInventoryOutboundView,
  SampleInventoryPageSize,
  SampleInventoryProductKind,
  SampleInventorySortOrder,
  SampleInventoryStockStatus,
  SampleInventoryTab,
  SampleInventoryUrlState,
} from "../_lib/sample-inventory-types";
import type { SampleInventoryPendingBatchEdit } from "../_hooks/use-sample-inventory-batch-actions";
import { SampleInventoryBatchActionsBar } from "./sample-inventory-batch-actions-bar";
import { InventoryTable } from "./sample-inventory-inventory-table";
import { SampleInventoryDataState } from "./sample-inventory-data-state";
import { SampleInventoryInboundRegistration } from "./sample-inventory-inbound-registration";
import { SampleInventoryInboundBatchBar } from "./sample-inventory-inbound-batch-bar";
import { SampleInventoryInboundTable } from "./sample-inventory-inbound-table";
import { SampleInventoryOutboundRegistration } from "./sample-inventory-outbound-registration";
import { SampleInventoryStatStrip } from "./sample-inventory-stat-strip";
import { OutboundTable } from "./sample-inventory-tables";
import { SampleInventoryWorkspaceToolbar } from "./sample-inventory-workspace-toolbar";
import styles from "../sample-inventory-workspace.module.css";

const PRIMARY_TABS: Array<{ key: SampleInventoryTab; label: string; icon: ReactNode }> = [
  { key: "outbound", label: "出库登记", icon: <ExportOutlined aria-hidden="true" /> },
  { key: "inventory", label: "库存", icon: <InboxOutlined aria-hidden="true" /> },
  { key: "inbound", label: "入库", icon: <ImportOutlined aria-hidden="true" /> },
  { key: "outbound-records", label: "出库记录", icon: <FileTextOutlined aria-hidden="true" /> },
  { key: "inbound-records", label: "入库记录", icon: <FileTextOutlined aria-hidden="true" /> },
];

const OUTBOUND_SUB_TABS: Array<{ status?: SampleInventoryOutboundStatus; label: string; countKey?: keyof SampleInventorySummary }> = [
  { status: "pending", label: "⏳ 待审批", countKey: "pendingOutboundCount" },
  { status: "approved", label: "✅ 已审批", countKey: "approvedOutboundCount" },
  { status: "sampled", label: "🧪 已取样", countKey: "sampledOutboundCount" },
  { status: "rejected", label: "❌ 已驳回", countKey: "rejectedOutboundCount" },
  { label: "📋 全部" },
];

const OUTBOUND_STATUS_OPTIONS = OUTBOUND_SUB_TABS.flatMap((tab) =>
  tab.status
    ? [
        {
          value: tab.status,
          label: tab.label.replace(/^[^ ]+ /, ""),
        },
      ]
    : [],
);

type SampleInventoryWorkspaceProps = {
  state: SampleInventoryUrlState;
  searchDraft: string;
  summary?: SampleInventorySummary;
  lowStockThreshold?: number;
  readOnly: boolean;
  pageSize: number;
  sampleOptions: SampleInventorySample[];
  settingsError: unknown;
  sampleOptionsError: unknown;
  lastUpdatedAt?: number;
  inventory: {
    items: SampleInventorySample[];
    total: number;
    loading: boolean;
    error: unknown;
  };
  outbounds: {
    items: SampleInventoryOutboundView[];
    total: number;
    loading: boolean;
    error: unknown;
  };
  inbounds: {
    items: SampleInventoryInbound[];
    total: number;
    loading: boolean;
    error: unknown;
  };
  selectedIds: number[];
  selectedSampleIds: number[];
  selectedInboundIds: number[];
  selectedStatus?: SampleInventoryOutboundStatus;
  outboundSubmitting: boolean;
  inboundSubmitting: boolean;
  backupDownloading: boolean;
  onCreateOutboundBatch: (payload: CreateSampleInventoryOutboundBatchRequest) => Promise<void>;
  onCreateInbound: (payload: CreateSampleInventoryInboundItem) => Promise<void>;
  onSearchDraftChange: (value: string) => void;
  onSearch: () => void;
  onTabChange: (tab: SampleInventoryTab) => void;
  onStatusChange: (status?: SampleInventoryOutboundFilter) => void;
  onStockStatusChange: (status: SampleInventoryStockStatus) => void;
  onProductKindChange: (kind: SampleInventoryProductKind) => void;
  onInventorySortChange: (sortOrder: SampleInventorySortOrder) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onPaginationChange: (page: number, pageSize: SampleInventoryPageSize) => void;
  onSelectedIdsChange: (ids: number[]) => void;
  onSelectedSampleIdsChange: (ids: number[]) => void;
  onSelectedInboundIdsChange: (ids: number[]) => void;
  onOpenSettings: () => void;
  onOpenSample: (item?: SampleInventorySample) => void;
  onAdjustSample: (item: SampleInventorySample) => void;
  onArchiveSample: (item: SampleInventorySample) => void;
  onOpenOutbound: (item?: SampleInventoryOutboundView) => void;
  onEditOutboundTracking: (item: SampleInventoryOutboundView) => void;
  onTransitionOutbound: (item: SampleInventoryOutboundView, status: SampleInventoryOutboundStatus) => void;
  onArchiveOutbound: (item: SampleInventoryOutboundView) => void;
  onVoidInbound: (item: SampleInventoryInbound) => void;
  onBatchTransition: (status: SampleInventoryOutboundStatus) => void;
  onBatchArchive: () => void;
  onBatchArchiveSamples: () => void;
  onBatchVoidInbounds: () => void;
  onBatchTracking: (trackingNumber: string) => void;
  onBatchEditPending: (values: SampleInventoryPendingBatchEdit) => void;
  onOpenImport: (kind: "samples" | "inbounds") => void;
  onOpenBatchInbound: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onDownload: (
    kind: "sample-template" | "sample-export" | "inbound-template" | "inbound-export" | "outbound-export",
  ) => void;
};

export function SampleInventoryWorkspace(props: SampleInventoryWorkspaceProps) {
  const { state, searchDraft, summary, selectedIds, selectedStatus } = props;
  const [alertDismissed, setAlertDismissed] = useState(false);
  const lowStockSamples = props.sampleOptions.filter((sample) => sample.isLowStock);
  const showOutbound = state.tab === "outbound" || state.tab === "outbound-records";
  const showInbound = state.tab === "inbound" || state.tab === "inbound-records";
  const selectedInboundCount = props.selectedInboundIds.length;
  const inboundDeleteDisabled = props.readOnly || selectedInboundCount === 0;
  const activeOutboundStatus = state.status ?? "pending";
  const lastUpdated = props.lastUpdatedAt
    ? new Date(props.lastUpdatedAt).toLocaleTimeString("zh-CN", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--";

  return (
    <main className={styles.pageRoot}>
      {!alertDismissed && lowStockSamples.length > 0 && (
        <Alert
          className={styles.lowStockAlert}
          type="warning"
          showIcon
          closable
          onClose={() => setAlertDismissed(true)}
          title={
            <span>
              <strong>库存预警：</strong>以下主品库存不足（≤
              {props.lowStockThreshold ?? 3}）：
              {lowStockSamples.map((sample) => `${sample.sampleName}(${sample.availableQuantity})`).join("、")}
            </span>
          }
        />
      )}

      <section className={styles.legacyShell}>
        <header className={styles.legacyHeader}>
          <div className={styles.legacyTitle}>
            <h1>📦 样品库存</h1>
            <p>
              <i className={styles.statusDot} /> 已连接
              <span>最后更新：{lastUpdated}</span>
            </p>
          </div>
          <nav className={styles.primaryTabs} aria-label="样品库存页面">
            {PRIMARY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={state.tab === tab.key ? styles.tabActive : undefined}
                onClick={() => props.onTabChange(tab.key)}
              >
                {tab.icon}
                {tab.label}
                {tab.key === "outbound" && (summary?.pendingOutboundCount ?? 0) > 0 && (
                  <span className={styles.pendingDot}>{summary?.pendingOutboundCount}</span>
                )}
              </button>
            ))}
          </nav>
        </header>

        {props.readOnly && (
          <Alert
            className={styles.routeAlert}
            type="warning"
            showIcon
            title="当前为只读运行模式，读取正常，写操作暂停。"
          />
        )}
        {Boolean(props.settingsError || props.sampleOptionsError) && (
          <Alert
            className={styles.routeAlert}
            type="warning"
            showIcon
            title="设置或样品选择项暂不可用，请稍后刷新。"
          />
        )}

        <SampleInventoryStatStrip tab={state.tab} summary={summary} />

        {state.tab === "outbound" && (
          <SampleInventoryOutboundRegistration
            samples={props.sampleOptions}
            readOnly={props.readOnly}
            submitting={props.outboundSubmitting}
            onSubmit={props.onCreateOutboundBatch}
          />
        )}

        {state.tab === "inbound" && (
          <SampleInventoryInboundRegistration
            samples={props.sampleOptions}
            readOnly={props.readOnly}
            submitting={props.inboundSubmitting}
            onSubmit={props.onCreateInbound}
            onOpenBatchInbound={props.onOpenBatchInbound}
            onOpenInboundImport={() => props.onOpenImport("inbounds")}
            onExport={() => props.onDownload("inbound-export")}
          />
        )}

        {state.tab === "outbound" && (
          <div className={styles.subTabs} role="tablist" aria-label="出库状态">
            {OUTBOUND_SUB_TABS.map((tab) => {
              const active = tab.status ? activeOutboundStatus === tab.status : activeOutboundStatus === "all";
              const count = tab.countKey ? Number(summary?.[tab.countKey] ?? 0) : undefined;
              return (
                <button
                  key={tab.status ?? "all"}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? styles.subTabActive : undefined}
                  onClick={() => props.onStatusChange(tab.status ?? "all")}
                >
                  {tab.label}
                  {count !== undefined && <span className={styles.subTabCount}>{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        <section className={styles.pageContent}>
          <SampleInventoryWorkspaceToolbar
            state={state}
            searchDraft={searchDraft}
            outboundStatusOptions={OUTBOUND_STATUS_OPTIONS}
            selectedSampleCount={props.selectedSampleIds.length}
            selectedOutboundCount={selectedIds.length}
            backupDownloading={props.backupDownloading}
            onSearchDraftChange={props.onSearchDraftChange}
            onSearch={props.onSearch}
            onStatusChange={props.onStatusChange}
            onStockStatusChange={props.onStockStatusChange}
            onProductKindChange={props.onProductKindChange}
            onInventorySortChange={props.onInventorySortChange}
            onDateFromChange={props.onDateFromChange}
            onDateToChange={props.onDateToChange}
            onOpenSettings={props.onOpenSettings}
            onOpenSample={() => props.onOpenSample()}
            onOpenImport={props.onOpenImport}
            onBatchArchiveSamples={props.onBatchArchiveSamples}
            onBatchArchiveOutbounds={props.onBatchArchive}
            onBackup={props.onBackup}
            onRestore={props.onRestore}
            onDownload={props.onDownload}
          />

          {showOutbound && (
            <>
              {state.tab === "outbound" && activeOutboundStatus !== "all" && (
                <SampleInventoryBatchActionsBar
                  activeStatus={activeOutboundStatus}
                  selectedCount={selectedIds.length}
                  selectedStatus={selectedStatus}
                  onTransition={props.onBatchTransition}
                  onArchive={props.onBatchArchive}
                  onTracking={props.onBatchTracking}
                  onEditPending={props.onBatchEditPending}
                />
              )}
              <SampleInventoryDataState
                error={props.outbounds.error}
                empty={!props.outbounds.loading && props.outbounds.items.length === 0}
              >
                <OutboundTable
                  items={props.outbounds.items}
                  loading={props.outbounds.loading}
                  total={props.outbounds.total}
                  page={state.page}
                  pageSize={props.pageSize}
                  selectedIds={selectedIds}
                  resizableColumns={state.tab === "outbound-records"}
                  selectableRows={state.tab === "outbound"}
                  showActions={state.tab !== "outbound-records"}
                  onSelectedIdsChange={props.onSelectedIdsChange}
                  onPaginationChange={props.onPaginationChange}
                  onEdit={props.onOpenOutbound}
                  onEditTracking={props.onEditOutboundTracking}
                  onTransition={props.onTransitionOutbound}
                  onArchive={props.onArchiveOutbound}
                />
              </SampleInventoryDataState>
            </>
          )}

          {state.tab === "inventory" && (
            <SampleInventoryDataState
              error={props.inventory.error}
              empty={!props.inventory.loading && props.inventory.items.length === 0}
            >
              <InventoryTable
                items={props.inventory.items}
                loading={props.inventory.loading}
                total={props.inventory.total}
                page={state.page}
                pageSize={props.pageSize}
                selectedIds={props.selectedSampleIds}
                onSelectedIdsChange={props.onSelectedSampleIdsChange}
                onPaginationChange={props.onPaginationChange}
                onEdit={props.onOpenSample}
                onAdjust={props.onAdjustSample}
                onArchive={props.onArchiveSample}
              />
            </SampleInventoryDataState>
          )}

          {showInbound && (
            <>
              {state.tab === "inbound" && (
                <SampleInventoryInboundBatchBar
                  disabled={inboundDeleteDisabled}
                  selectedCount={selectedInboundCount}
                  onConfirm={props.onBatchVoidInbounds}
                />
              )}
              <SampleInventoryDataState
                error={props.inbounds.error}
                empty={!props.inbounds.loading && props.inbounds.items.length === 0}
              >
                <SampleInventoryInboundTable
                  items={props.inbounds.items}
                  loading={props.inbounds.loading}
                  total={props.inbounds.total}
                  page={state.page}
                  pageSize={props.pageSize}
                  selectedIds={props.selectedInboundIds}
                  selectableRows={state.tab === "inbound"}
                  showActions={state.tab === "inbound"}
                  onSelectedIdsChange={props.onSelectedInboundIdsChange}
                  onPaginationChange={props.onPaginationChange}
                  onDelete={props.onVoidInbound}
                />
              </SampleInventoryDataState>
            </>
          )}
        </section>

        <footer className={styles.legacyFooter}>
          💡 数据统一存储在 PostgreSQL · 写操作成功后立即更新 · 页面可见时后台自动同步
        </footer>
      </section>
    </main>
  );
}
