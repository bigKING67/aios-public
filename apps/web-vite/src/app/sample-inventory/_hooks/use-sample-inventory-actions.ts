import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MessageInstance } from "antd/es/message/interface";

import type {
  ArchiveSampleInventorySampleRequest,
  BatchArchiveSampleInventorySamplesRequest,
  BatchArchiveSampleInventoryOutboundRequest,
  BatchEditSampleInventoryOutboundRequest,
  BatchTransitionSampleInventoryOutboundRequest,
  BatchUpdateSampleInventoryOutboundTrackingRequest,
  BatchVoidSampleInventoryInboundsRequest,
  CreateSampleInventoryInboundBatchRequest,
  CreateSampleInventoryInboundRequest,
  CreateSampleInventoryOutboundBatchRequest,
  CreateSampleInventoryOutboundRequest,
  CreateSampleInventorySampleRequest,
  ImportSampleInventoryInboundsRequest,
  ImportSampleInventorySamplesRequest,
  ParseSampleInventoryBackupRequest,
  RestoreSampleInventoryBackupRequest,
  SampleInventoryAdjustmentRequest,
  SampleInventoryInbound,
  SampleInventoryInboundListResponse,
  SampleInventoryOutbound,
  SampleInventorySample,
  SampleInventorySampleListResponse,
  TransitionSampleInventoryOutboundRequest,
  UpdateSampleInventoryOutboundRequest,
  UpdateSampleInventoryOutboundTrackingRequest,
  UpdateSampleInventorySampleRequest,
  UpdateSampleInventorySettingsRequest,
  VoidSampleInventoryInboundRequest,
} from "@/lib/generated-api-contract";
import { resolveClientErrorMessage, resolveClientErrorStatus } from "@/lib/client-error";
import {
  adjustSampleInventorySample,
  archiveSampleInventorySample,
  batchArchiveSampleInventorySamples,
  batchArchiveSampleInventoryOutbounds,
  batchEditSampleInventoryOutbounds,
  batchTransitionSampleInventoryOutbounds,
  batchUpdateSampleInventoryOutboundTracking,
  batchVoidSampleInventoryInbounds,
  createSampleInventoryInboundBatch,
  createSampleInventoryInbound,
  createSampleInventoryOutboundBatch,
  createSampleInventoryOutbound,
  createSampleInventorySample,
  fetchSampleInventoryBackup,
  importSampleInventoryInbounds,
  importSampleInventorySamples,
  parseSampleInventoryBackup,
  parseSampleInventoryInboundXlsx,
  parseSampleInventorySampleXlsx,
  restoreSampleInventoryBackup,
  transitionSampleInventoryOutbound,
  updateSampleInventoryOutbound,
  updateSampleInventoryOutboundTracking,
  updateSampleInventorySample,
  updateSampleInventorySettings,
  voidSampleInventoryInbound,
} from "../_lib/sample-inventory-api";
import { sampleInventoryQueryKeys } from "../_lib/sample-inventory-query-keys";
import {
  normalizeOutboundStatus,
  type SampleInventoryInboundQuery,
  type SampleInventoryOutboundListView,
  type SampleInventoryOutboundQuery,
  type SampleInventoryOutboundView,
  type SampleInventorySampleQuery,
} from "../_lib/sample-inventory-types";

type UseSampleInventoryActionsOptions = {
  messageApi: MessageInstance;
  setReadOnly: (readOnly: boolean) => void;
};

function sampleMatchesQuery(item: SampleInventorySample, query?: SampleInventorySampleQuery): boolean {
  if (!query) return true;
  if (item.archivedAt && !query.includeArchived) return false;
  if (query.productKind && item.productKind !== query.productKind) return false;
  if (query.stockStatus === "in_stock" && item.availableQuantity <= 0) return false;
  if (query.stockStatus === "low" && !item.isLowStock) return false;
  if (query.stockStatus === "out" && item.availableQuantity !== 0) return false;

  if (query.keyword) {
    const keyword = query.keyword.toLocaleLowerCase("zh-CN");
    const matchesKeyword = [item.sampleCode, item.sampleName, item.model ?? ""].some((value) =>
      value.toLocaleLowerCase("zh-CN").includes(keyword),
    );
    if (!matchesKeyword) return false;
  }

  const updatedAt = Date.parse(item.updatedAt);
  if (query.dateFrom && updatedAt < Date.parse(query.dateFrom)) return false;
  if (query.dateTo && updatedAt > Date.parse(query.dateTo)) return false;
  return true;
}

export function useSampleInventoryActions({ messageApi, setReadOnly }: UseSampleInventoryActionsOptions) {
  const queryClient = useQueryClient();

  const reportError = useCallback(
    (error: unknown, fallback: string) => {
      const status = resolveClientErrorStatus(error);
      if (status === 503) {
        setReadOnly(true);
        messageApi.warning("当前为只读运行模式，读取正常，写操作暂停。");
        return;
      }
      if (status === 409) {
        messageApi.error("数据已被其他操作更新，请刷新列表后重试。");
        return;
      }
      messageApi.error(resolveClientErrorMessage(error, fallback));
    },
    [messageApi, setReadOnly],
  );

  const markWriteSuccess = useCallback(
    (content: string) => {
      setReadOnly(false);
      messageApi.success(content);
    },
    [messageApi, setReadOnly],
  );

  const invalidateSamples = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.samplesRoot(),
        }),
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.summary(),
        }),
      ]),
    [queryClient],
  );
  const invalidateInbounds = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.inboundsRoot(),
        }),
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.summary(),
        }),
      ]),
    [queryClient],
  );
  const invalidateOutbounds = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.outboundsRoot(),
        }),
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.summary(),
        }),
      ]),
    [queryClient],
  );
  const invalidateSamplesAndOutbounds = useCallback(
    () =>
      Promise.all([
        invalidateSamples(),
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.outboundsRoot(),
        }),
      ]),
    [invalidateSamples, queryClient],
  );

  const reconcileSamplesInCache = useCallback(
    (updatedItems: readonly SampleInventorySample[]) => {
      const updatedById = new Map(updatedItems.map((item) => [item.id, item]));
      for (const [queryKey, current] of queryClient.getQueriesData<SampleInventorySampleListResponse>({
        queryKey: sampleInventoryQueryKeys.samplesRoot(),
      })) {
        if (!current) continue;
        const query = queryKey[2] as SampleInventorySampleQuery | undefined;
        let changed = false;
        let removedCount = 0;
        const items = current.items.flatMap((item) => {
          const updated = updatedById.get(item.id);
          if (!updated) return [item];
          changed = true;
          if (!sampleMatchesQuery(updated, query)) {
            removedCount += 1;
            return [];
          }
          return [updated];
        });
        if (!changed) continue;
        queryClient.setQueryData<SampleInventorySampleListResponse>(queryKey, {
          ...current,
          items,
          total: Math.max(0, current.total - removedCount),
        });
      }
    },
    [queryClient],
  );

  const reconcileInboundsInCache = useCallback(
    (updatedItems: readonly SampleInventoryInbound[]) => {
      const updatedById = new Map(updatedItems.map((item) => [item.id, item]));
      for (const [queryKey, current] of queryClient.getQueriesData<SampleInventoryInboundListResponse>({
        queryKey: sampleInventoryQueryKeys.inboundsRoot(),
      })) {
        if (!current) continue;
        const query = queryKey[2] as SampleInventoryInboundQuery | undefined;
        let changed = false;
        let removedCount = 0;
        const items = current.items.flatMap((item) => {
          const updated = updatedById.get(item.id);
          if (!updated) return [item];
          changed = true;
          if (updated.voidedAt && !query?.includeVoided) {
            removedCount += 1;
            return [];
          }
          return [updated];
        });
        if (!changed) continue;
        queryClient.setQueryData<SampleInventoryInboundListResponse>(queryKey, {
          ...current,
          items,
          total: Math.max(0, current.total - removedCount),
        });
      }
    },
    [queryClient],
  );

  const reconcileOutboundsInCache = useCallback(
    (updatedItems: readonly SampleInventoryOutbound[]) => {
      const updatedById = new Map<number, SampleInventoryOutboundView>(
        updatedItems.map((item) => [item.id, { ...item, status: normalizeOutboundStatus(item.status) }]),
      );
      for (const [queryKey, current] of queryClient.getQueriesData<SampleInventoryOutboundListView>({
        queryKey: sampleInventoryQueryKeys.outboundsRoot(),
      })) {
        if (!current) continue;
        const query = queryKey[2] as SampleInventoryOutboundQuery | undefined;
        let changed = false;
        let removedCount = 0;
        const items = current.items.flatMap((item) => {
          const updated = updatedById.get(item.id);
          if (!updated) return [item];
          changed = true;
          const remainsVisible =
            (!query?.status || updated.status === query.status) &&
            (!query?.sampleId || updated.sampleId === query.sampleId);
          if (!remainsVisible) {
            removedCount += 1;
            return [];
          }
          return [updated];
        });
        if (!changed) continue;
        queryClient.setQueryData<SampleInventoryOutboundListView>(queryKey, {
          ...current,
          items,
          total: Math.max(0, current.total - removedCount),
        });
      }
    },
    [queryClient],
  );

  const removeArchivedOutboundsFromCache = useCallback(
    (archivedIds: readonly number[]) => {
      const archivedIdSet = new Set(archivedIds);
      queryClient.setQueriesData<SampleInventoryOutboundListView>(
        { queryKey: sampleInventoryQueryKeys.outboundsRoot() },
        (current) => {
          if (!current) return current;
          const items = current.items.filter((item) => !archivedIdSet.has(item.id));
          const removedCount = current.items.length - items.length;
          if (removedCount === 0) return current;
          return {
            ...current,
            items,
            total: Math.max(0, current.total - removedCount),
          };
        },
      );
    },
    [queryClient],
  );
  const invalidateAllInventoryData = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.settings(),
        }),
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.samplesRoot(),
        }),
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.inboundsRoot(),
        }),
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.outboundsRoot(),
        }),
        queryClient.invalidateQueries({
          queryKey: sampleInventoryQueryKeys.summary(),
        }),
      ]),
    [queryClient],
  );

  const settingsMutation = useMutation({
    mutationFn: (payload: UpdateSampleInventorySettingsRequest) => updateSampleInventorySettings(payload),
    retry: false,
    onSuccess: async (settings) => {
      queryClient.setQueryData(sampleInventoryQueryKeys.settings(), settings);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sampleInventoryQueryKeys.settings() }),
        invalidateSamples(),
      ]);
      markWriteSuccess("设置已保存");
    },
    onError: (error) => reportError(error, "保存设置失败"),
  });

  const exportBackupMutation = useMutation({
    mutationFn: fetchSampleInventoryBackup,
    retry: false,
    onError: (error) => reportError(error, "下载备份失败"),
  });

  const createSampleMutation = useMutation({
    mutationFn: (payload: CreateSampleInventorySampleRequest) => createSampleInventorySample(payload),
    retry: false,
    onSuccess: async () => {
      await invalidateSamples();
      markWriteSuccess("样品已创建");
    },
    onError: (error) => reportError(error, "创建样品失败"),
  });

  const updateSampleMutation = useMutation({
    mutationFn: ({ sampleId, payload }: { sampleId: number; payload: UpdateSampleInventorySampleRequest }) =>
      updateSampleInventorySample(sampleId, payload),
    retry: false,
    onSuccess: (sample) => {
      reconcileSamplesInCache([sample]);
      markWriteSuccess("样品信息已更新");
      void invalidateSamples();
    },
    onError: (error) => reportError(error, "更新样品失败"),
  });

  const adjustSampleMutation = useMutation({
    mutationFn: ({ sampleId, payload }: { sampleId: number; payload: SampleInventoryAdjustmentRequest }) =>
      adjustSampleInventorySample(sampleId, payload),
    retry: false,
    onSuccess: (sample) => {
      reconcileSamplesInCache([sample]);
      markWriteSuccess("库存调整已记账");
      void invalidateSamples();
    },
    onError: (error) => reportError(error, "调整库存失败"),
  });

  const archiveSampleMutation = useMutation({
    mutationFn: ({ sampleId, payload }: { sampleId: number; payload: ArchiveSampleInventorySampleRequest }) =>
      archiveSampleInventorySample(sampleId, payload),
    retry: false,
    onSuccess: (sample) => {
      reconcileSamplesInCache([sample]);
      markWriteSuccess("样品已归档");
      void invalidateSamples();
    },
    onError: (error) => reportError(error, "归档样品失败"),
  });

  const batchArchiveSamplesMutation = useMutation({
    mutationFn: (payload: BatchArchiveSampleInventorySamplesRequest) => batchArchiveSampleInventorySamples(payload),
    retry: false,
    onSuccess: (response) => {
      reconcileSamplesInCache(response.items);
      markWriteSuccess("样品已批量归档");
      void invalidateSamples();
    },
    onError: (error) => reportError(error, "批量归档样品失败"),
  });

  const createInboundMutation = useMutation({
    mutationFn: (payload: CreateSampleInventoryInboundRequest) => createSampleInventoryInbound(payload),
    retry: false,
    onSuccess: async () => {
      await Promise.all([invalidateSamples(), invalidateInbounds()]);
      markWriteSuccess("入库记录已登记");
    },
    onError: (error) => reportError(error, "登记入库失败"),
  });

  const createInboundBatchMutation = useMutation({
    mutationFn: (payload: CreateSampleInventoryInboundBatchRequest) => createSampleInventoryInboundBatch(payload),
    retry: false,
    onSuccess: async () => {
      await Promise.all([invalidateSamples(), invalidateInbounds()]);
      markWriteSuccess("批量入库已完成");
    },
    onError: (error) => reportError(error, "批量入库失败"),
  });

  const voidInboundMutation = useMutation({
    mutationFn: ({ inboundId, payload }: { inboundId: number; payload: VoidSampleInventoryInboundRequest }) =>
      voidSampleInventoryInbound(inboundId, payload),
    retry: false,
    onSuccess: (inbound) => {
      reconcileInboundsInCache([inbound]);
      markWriteSuccess("入库记录已删除并完成库存扣减");
      void invalidateSamples();
      void invalidateInbounds();
    },
    onError: (error) => reportError(error, "删除入库记录失败"),
  });

  const batchVoidInboundsMutation = useMutation({
    mutationFn: (payload: BatchVoidSampleInventoryInboundsRequest) => batchVoidSampleInventoryInbounds(payload),
    retry: false,
    onSuccess: (response) => {
      reconcileInboundsInCache(response.items);
      markWriteSuccess("入库记录已批量删除并完成库存扣减");
      void invalidateSamples();
      void invalidateInbounds();
    },
    onError: (error) => reportError(error, "批量删除入库记录失败"),
  });

  const createOutboundMutation = useMutation({
    mutationFn: (payload: CreateSampleInventoryOutboundRequest) => createSampleInventoryOutbound(payload),
    retry: false,
    onSuccess: async () => {
      await invalidateOutbounds();
      markWriteSuccess("领用申请已创建");
    },
    onError: (error) => reportError(error, "创建领用申请失败"),
  });

  const createOutboundBatchMutation = useMutation({
    mutationFn: (payload: CreateSampleInventoryOutboundBatchRequest) => createSampleInventoryOutboundBatch(payload),
    retry: false,
    onSuccess: async () => {
      await invalidateOutbounds();
      markWriteSuccess("出库申请已提交");
    },
    onError: (error) => reportError(error, "提交出库申请失败"),
  });

  const updateOutboundMutation = useMutation({
    mutationFn: ({ requestId, payload }: { requestId: number; payload: UpdateSampleInventoryOutboundRequest }) =>
      updateSampleInventoryOutbound(requestId, payload),
    retry: false,
    onSuccess: (outbound) => {
      reconcileOutboundsInCache([outbound]);
      markWriteSuccess("领用申请已更新");
      void invalidateOutbounds();
    },
    onError: (error) => reportError(error, "更新领用申请失败"),
  });

  const updateOutboundTrackingMutation = useMutation({
    mutationFn: ({
      requestId,
      payload,
    }: {
      requestId: number;
      payload: UpdateSampleInventoryOutboundTrackingRequest;
    }) => updateSampleInventoryOutboundTracking(requestId, payload),
    retry: false,
    onSuccess: (outbound) => {
      reconcileOutboundsInCache([outbound]);
      markWriteSuccess("快递单号已更新");
      void invalidateOutbounds();
    },
    onError: (error) => reportError(error, "更新快递单号失败"),
  });

  const batchUpdateOutboundTrackingMutation = useMutation({
    mutationFn: (payload: BatchUpdateSampleInventoryOutboundTrackingRequest) =>
      batchUpdateSampleInventoryOutboundTracking(payload),
    retry: false,
    onSuccess: (response) => {
      reconcileOutboundsInCache(response.items);
      markWriteSuccess("快递单号已批量更新");
      void invalidateOutbounds();
    },
    onError: (error) => reportError(error, "批量更新快递单号失败"),
  });

  const transitionOutboundMutation = useMutation({
    mutationFn: ({ requestId, payload }: { requestId: number; payload: TransitionSampleInventoryOutboundRequest }) =>
      transitionSampleInventoryOutbound(requestId, payload),
    retry: false,
    onSuccess: (outbound) => {
      reconcileOutboundsInCache([outbound]);
      markWriteSuccess("领用状态已更新");
      void invalidateSamples();
      void invalidateOutbounds();
    },
    onError: (error) => reportError(error, "更新领用状态失败"),
  });

  const batchTransitionOutboundMutation = useMutation({
    mutationFn: (payload: BatchTransitionSampleInventoryOutboundRequest) =>
      batchTransitionSampleInventoryOutbounds(payload),
    retry: false,
    onSuccess: (response) => {
      reconcileOutboundsInCache(response.items);
      markWriteSuccess("批量状态更新已完成");
      void invalidateSamples();
      void invalidateOutbounds();
    },
    onError: (error) => reportError(error, "批量状态更新失败"),
  });

  const batchArchiveOutboundMutation = useMutation({
    mutationFn: (payload: BatchArchiveSampleInventoryOutboundRequest) => batchArchiveSampleInventoryOutbounds(payload),
    retry: false,
    onSuccess: (_response, payload) => {
      removeArchivedOutboundsFromCache(payload.items.map((item) => item.id));
      markWriteSuccess("出库记录已删除，库存已按状态同步");
      void invalidateSamplesAndOutbounds();
    },
    onError: (error) => reportError(error, "删除出库记录失败"),
  });

  const batchEditOutboundMutation = useMutation({
    mutationFn: (payload: BatchEditSampleInventoryOutboundRequest) => batchEditSampleInventoryOutbounds(payload),
    retry: false,
    onSuccess: (response) => {
      reconcileOutboundsInCache(response.items);
      markWriteSuccess("待审批申请已批量更新");
      void invalidateOutbounds();
    },
    onError: (error) => reportError(error, "批量编辑待审批申请失败"),
  });

  const parseSampleImportMutation = useMutation({
    mutationFn: parseSampleInventorySampleXlsx,
    retry: false,
    onError: (error) => reportError(error, "解析样品 XLSX 失败"),
  });

  const importSamplesMutation = useMutation({
    mutationFn: (payload: ImportSampleInventorySamplesRequest) => importSampleInventorySamples(payload),
    retry: false,
    onSuccess: async () => {
      await invalidateSamples();
      markWriteSuccess("样品 XLSX 已导入");
    },
    onError: (error) => reportError(error, "导入样品 XLSX 失败"),
  });

  const parseInboundImportMutation = useMutation({
    mutationFn: parseSampleInventoryInboundXlsx,
    retry: false,
    onError: (error) => reportError(error, "解析入库 XLSX 失败"),
  });

  const importInboundsMutation = useMutation({
    mutationFn: (payload: ImportSampleInventoryInboundsRequest) => importSampleInventoryInbounds(payload),
    retry: false,
    onSuccess: async () => {
      await Promise.all([invalidateSamples(), invalidateInbounds()]);
      markWriteSuccess("入库 XLSX 已导入");
    },
    onError: (error) => reportError(error, "导入入库 XLSX 失败"),
  });

  const parseBackupMutation = useMutation({
    mutationFn: (payload: ParseSampleInventoryBackupRequest) => parseSampleInventoryBackup(payload),
    retry: false,
    onError: (error) => reportError(error, "解析备份文件失败"),
  });

  const restoreBackupMutation = useMutation({
    mutationFn: (payload: RestoreSampleInventoryBackupRequest) => restoreSampleInventoryBackup(payload),
    retry: false,
    onSuccess: async () => {
      await invalidateAllInventoryData();
      markWriteSuccess("备份已恢复");
    },
    onError: (error) => reportError(error, "恢复备份失败"),
  });

  return {
    adjustSampleMutation,
    batchArchiveSamplesMutation,
    archiveSampleMutation,
    batchArchiveOutboundMutation,
    batchEditOutboundMutation,
    batchTransitionOutboundMutation,
    batchUpdateOutboundTrackingMutation,
    batchVoidInboundsMutation,
    createInboundBatchMutation,
    createInboundMutation,
    createOutboundBatchMutation,
    createOutboundMutation,
    createSampleMutation,
    exportBackupMutation,
    importInboundsMutation,
    importSamplesMutation,
    parseInboundImportMutation,
    parseBackupMutation,
    parseSampleImportMutation,
    restoreBackupMutation,
    settingsMutation,
    transitionOutboundMutation,
    updateOutboundMutation,
    updateOutboundTrackingMutation,
    updateSampleMutation,
    voidInboundMutation,
  };
}
