import { useEffect, useMemo, useState } from "react";
import { App } from "antd";

import { useSampleInventoryActions } from "../_hooks/use-sample-inventory-actions";
import { useSampleInventoryBackupController } from "../_hooks/use-sample-inventory-backup-controller";
import { useSampleInventoryBatchActions } from "../_hooks/use-sample-inventory-batch-actions";
import { useSampleInventoryImportController } from "../_hooks/use-sample-inventory-import-controller";
import { useSampleInventoryOperationController } from "../_hooks/use-sample-inventory-operation-controller";
import { useSampleInventoryQueries } from "../_hooks/use-sample-inventory-queries";
import { useSampleInventoryUrlState } from "../_hooks/use-sample-inventory-url-state";
import { orderSampleInventoryOptions } from "../_lib/sample-inventory-view-options";
import { SampleInventoryBackupDialog } from "./sample-inventory-backup-dialog";
import { SampleInventoryBatchInboundDialog } from "./sample-inventory-batch-inbound-dialog";
import { SampleInventoryModalLayer } from "./sample-inventory-modal-layer";
import { SampleInventoryTrackingDialog } from "./sample-inventory-tracking-dialog";
import { SampleInventoryWorkspace } from "./sample-inventory-workspace";

export function SampleInventoryApplication() {
  const { message: messageApi } = App.useApp();
  const { state, setTab, updateState } = useSampleInventoryUrlState();
  const queries = useSampleInventoryQueries(state);
  const [readOnly, setReadOnly] = useState(false);
  const actions = useSampleInventoryActions({ messageApi, setReadOnly });
  const [searchDraft, setSearchDraft] = useState(state.keyword);

  useEffect(() => setSearchDraft(state.keyword), [state.keyword]);
  const sampleOptions = useMemo(
    () => orderSampleInventoryOptions(queries.sampleOptionsQuery.data?.items ?? []),
    [queries.sampleOptionsQuery.data?.items],
  );
  const outboundItems = useMemo(() => queries.outboundQuery.data?.items ?? [], [queries.outboundQuery.data?.items]);

  const guardWrite = (): boolean => {
    if (!readOnly) return true;
    messageApi.warning("当前为只读运行模式，写操作暂停。");
    return false;
  };

  const operations = useSampleInventoryOperationController({
    actions,
    guardWrite,
    settings: queries.settingsQuery.data,
  });
  const imports = useSampleInventoryImportController({ actions, guardWrite });
  const backup = useSampleInventoryBackupController({
    actions,
    guardWrite,
    messageApi,
    onReadOnlyDetected: () => setReadOnly(true),
  });
  const batchActions = useSampleInventoryBatchActions({
    actions,
    state,
    inventoryItems: queries.inventoryQuery.data?.items ?? [],
    inboundItems: queries.inboundQuery.data?.items ?? [],
    outboundItems,
    guardWrite,
  });

  return (
    <>
      <input
        ref={backup.fileInputRef}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={backup.selectFile}
      />
      <SampleInventoryWorkspace
        state={state}
        searchDraft={searchDraft}
        summary={queries.summaryQuery.data}
        lowStockThreshold={queries.settingsQuery.data?.lowStockThreshold}
        readOnly={readOnly}
        pageSize={queries.pageSize}
        sampleOptions={sampleOptions}
        settingsError={queries.settingsQuery.error}
        sampleOptionsError={queries.sampleOptionsQuery.error}
        lastUpdatedAt={queries.summaryQuery.dataUpdatedAt}
        inventory={{
          items: queries.inventoryQuery.data?.items ?? [],
          total: queries.inventoryQuery.data?.total ?? 0,
          loading: queries.inventoryQuery.isLoading,
          error: queries.inventoryQuery.error,
        }}
        outbounds={{
          items: outboundItems,
          total: queries.outboundQuery.data?.total ?? 0,
          loading: queries.outboundQuery.isLoading,
          error: queries.outboundQuery.error,
        }}
        inbounds={{
          items: queries.inboundQuery.data?.items ?? [],
          total: queries.inboundQuery.data?.total ?? 0,
          loading: queries.inboundQuery.isLoading,
          error: queries.inboundQuery.error,
        }}
        selectedIds={batchActions.selectedIds}
        selectedSampleIds={batchActions.selectedSampleIds}
        selectedInboundIds={batchActions.selectedInboundIds}
        selectedStatus={batchActions.selectedStatus}
        outboundSubmitting={actions.createOutboundBatchMutation.isPending}
        inboundSubmitting={actions.createInboundMutation.isPending}
        backupDownloading={actions.exportBackupMutation.isPending}
        onCreateOutboundBatch={operations.createOutboundBatch}
        onCreateInbound={operations.createInboundInline}
        onSearchDraftChange={setSearchDraft}
        onSearch={() => updateState({ keyword: searchDraft, page: 1 })}
        onTabChange={setTab}
        onStatusChange={(status) => updateState({ status, page: 1 })}
        onStockStatusChange={(stockStatus) => updateState({ stockStatus, page: 1 })}
        onProductKindChange={(productKind) => updateState({ productKind, page: 1 })}
        onInventorySortChange={(sortOrder) => updateState({ sortOrder, page: 1 })}
        onDateFromChange={(dateFrom) => updateState({ dateFrom, page: 1 })}
        onDateToChange={(dateTo) => updateState({ dateTo, page: 1 })}
        onPaginationChange={(page, pageSize) =>
          updateState({
            page: pageSize === state.pageSize ? page : 1,
            pageSize,
          })
        }
        onSelectedIdsChange={batchActions.setSelectedIds}
        onSelectedSampleIdsChange={batchActions.setSelectedSampleIds}
        onSelectedInboundIdsChange={batchActions.setSelectedInboundIds}
        onOpenSettings={operations.openSettings}
        onOpenSample={operations.openSample}
        onAdjustSample={operations.openAdjustment}
        onArchiveSample={operations.archiveSample}
        onOpenOutbound={operations.openOutbound}
        onEditOutboundTracking={operations.openTracking}
        onTransitionOutbound={operations.transitionOutbound}
        onArchiveOutbound={batchActions.archiveOutbound}
        onVoidInbound={operations.openVoidInbound}
        onBatchTransition={batchActions.batchTransition}
        onBatchArchive={batchActions.batchArchiveOutbounds}
        onBatchArchiveSamples={batchActions.batchArchiveSamples}
        onBatchVoidInbounds={batchActions.batchVoidInbounds}
        onBatchTracking={batchActions.batchUpdateTracking}
        onBatchEditPending={batchActions.batchEditPending}
        onOpenImport={imports.open}
        onOpenBatchInbound={operations.openBatchInbound}
        onBackup={backup.downloadBackup}
        onRestore={backup.openRestoreFile}
        onDownload={(kind) => void backup.download(kind)}
      />
      <SampleInventoryModalLayer
        actions={actions}
        samples={sampleOptions}
        settings={queries.settingsQuery.data}
        sampleTarget={operations.sampleTarget}
        adjustTarget={operations.adjustTarget}
        inboundOpen={operations.inboundOpen}
        voidInboundTarget={operations.voidInboundTarget}
        outboundTarget={operations.outboundTarget}
        settingsOpen={operations.settingsOpen}
        importKind={imports.kind}
        importPreview={imports.preview}
        onCloseSample={operations.closeSample}
        onCloseAdjustment={operations.closeAdjustment}
        onCloseInbound={operations.closeInbound}
        onCloseVoidInbound={operations.closeVoidInbound}
        onCloseOutbound={operations.closeOutbound}
        onCloseSettings={operations.closeSettings}
        onCloseImport={imports.close}
        onSubmitSample={operations.submitSample}
        onSubmitAdjustment={operations.submitAdjustment}
        onSubmitInbound={operations.submitInbound}
        onSubmitVoidInbound={operations.submitVoidInbound}
        onSubmitOutbound={operations.submitOutbound}
        onSubmitSettings={operations.submitSettings}
        onParseImport={imports.parse}
        onImport={imports.run}
        onDownloadImportTemplate={(kind) =>
          void backup.download(kind === "samples" ? "sample-template" : "inbound-template")
        }
      />
      <SampleInventoryBatchInboundDialog
        open={operations.batchInboundOpen}
        samples={sampleOptions}
        loading={actions.createInboundBatchMutation.isPending}
        onCancel={operations.cancelBatchInbound}
        onSubmit={operations.submitBatchInbound}
      />
      <SampleInventoryBackupDialog
        open={backup.restoreOpen}
        fileName={backup.hasSelectedFile ? "已选择 JSON 备份文件" : undefined}
        preview={backup.preview}
        parsing={actions.parseBackupMutation.isPending}
        restoring={actions.restoreBackupMutation.isPending}
        onCancel={backup.resetRestore}
        onRestore={backup.restore}
      />
      <SampleInventoryTrackingDialog
        item={operations.trackingTarget}
        loading={actions.updateOutboundTrackingMutation.isPending}
        onCancel={operations.cancelTracking}
        onSubmit={operations.submitTrackingNumber}
      />
    </>
  );
}
