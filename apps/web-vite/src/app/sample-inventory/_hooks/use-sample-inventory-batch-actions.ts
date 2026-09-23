import { useEffect, useMemo, useState } from "react";

import type { SampleInventoryInbound, SampleInventorySample } from "@/lib/generated-api-contract";
import type {
  SampleInventoryOutboundStatus,
  SampleInventoryOutboundView,
  SampleInventoryUrlState,
} from "../_lib/sample-inventory-types";
import type { useSampleInventoryActions } from "./use-sample-inventory-actions";
import { useSampleInventorySubmissionKeys } from "./use-sample-inventory-submission-keys";

type UseSampleInventoryBatchActionsOptions = {
  actions: ReturnType<typeof useSampleInventoryActions>;
  state: SampleInventoryUrlState;
  inventoryItems: SampleInventorySample[];
  inboundItems: SampleInventoryInbound[];
  outboundItems: SampleInventoryOutboundView[];
  guardWrite: () => boolean;
};

export type SampleInventoryPendingBatchEdit = {
  applicant?: string;
  department?: string;
  purpose?: string;
  receiver?: string;
  shippingAddress?: string;
};

export function useSampleInventoryBatchActions({
  actions,
  state,
  inventoryItems,
  inboundItems,
  outboundItems,
  guardWrite,
}: UseSampleInventoryBatchActionsOptions) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedSampleIds, setSelectedSampleIds] = useState<number[]>([]);
  const [selectedInboundIds, setSelectedInboundIds] = useState<number[]>([]);
  const submissionKeys = useSampleInventorySubmissionKeys();

  useEffect(() => {
    setSelectedIds([]);
    setSelectedSampleIds([]);
    setSelectedInboundIds([]);
  }, [
    state.dateFrom,
    state.dateTo,
    state.keyword,
    state.page,
    state.pageSize,
    state.productKind,
    state.sortOrder,
    state.status,
    state.stockStatus,
    state.tab,
  ]);

  const selectedItems = useMemo(
    () => outboundItems.filter((item) => selectedIds.includes(item.id)),
    [outboundItems, selectedIds],
  );
  const selectedStatus = useMemo<SampleInventoryOutboundStatus | undefined>(() => {
    if (selectedItems.length !== selectedIds.length || selectedItems.length === 0) {
      return undefined;
    }
    const status = selectedItems[0]?.status;
    return selectedItems.every((item) => item.status === status) ? status : undefined;
  }, [selectedIds.length, selectedItems]);

  const submissionKeyFor = (operation: string, fingerprint: string): string => {
    return submissionKeys.acquire(operation, fingerprint).submissionKey;
  };

  const clearKey = (operation: string, fingerprint: string) => {
    submissionKeys.releaseFor(operation, fingerprint);
  };
  const selectedTargets = selectedItems.map((item) => ({
    id: item.id,
    expectedVersion: item.version,
  }));

  const batchTransition = (targetStatus: SampleInventoryOutboundStatus) => {
    if (!guardWrite() || selectedTargets.length !== selectedIds.length) return;
    const items = [...selectedTargets].sort((left, right) => left.id - right.id);
    const fingerprint = `transition:${targetStatus}:${items
      .map((item) => `${item.id}@${item.expectedVersion}`)
      .join(",")}`;
    actions.batchTransitionOutboundMutation.mutate(
      {
        submissionKey: submissionKeyFor("outbound-transition", fingerprint),
        items,
        targetStatus,
      },
      {
        onSuccess: () => {
          clearKey("outbound-transition", fingerprint);
          setSelectedIds([]);
        },
      },
    );
  };

  const archiveOutbound = (item: SampleInventoryOutboundView) => {
    if (!guardWrite()) return;
    const fingerprint = `archive:${item.id}@${item.version}`;
    actions.batchArchiveOutboundMutation.mutate(
      {
        submissionKey: submissionKeyFor("outbound-archive", fingerprint),
        items: [{ id: item.id, expectedVersion: item.version }],
      },
      { onSuccess: () => clearKey("outbound-archive", fingerprint) },
    );
  };

  const batchArchiveOutbounds = () => {
    if (!guardWrite() || selectedTargets.length !== selectedIds.length) return;
    const items = [...selectedTargets].sort((left, right) => left.id - right.id);
    const fingerprint = `archive:${items.map((item) => `${item.id}@${item.expectedVersion}`).join(",")}`;
    actions.batchArchiveOutboundMutation.mutate(
      {
        submissionKey: submissionKeyFor("outbound-archive", fingerprint),
        items,
      },
      {
        onSuccess: () => {
          clearKey("outbound-archive", fingerprint);
          setSelectedIds([]);
        },
      },
    );
  };

  const batchArchiveSamples = () => {
    if (!guardWrite()) return;
    const items = inventoryItems
      .filter((item) => selectedSampleIds.includes(item.id))
      .map((item) => ({ id: item.id, expectedVersion: item.version }))
      .sort((left, right) => left.id - right.id);
    if (items.length !== selectedSampleIds.length || items.length === 0) return;
    const fingerprint = `sample-archive:${items.map((item) => `${item.id}@${item.expectedVersion}`).join(",")}`;
    actions.batchArchiveSamplesMutation.mutate(
      {
        submissionKey: submissionKeyFor("sample-archive", fingerprint),
        items,
        reason: "旧版库存页批量归档",
      },
      {
        onSuccess: () => {
          clearKey("sample-archive", fingerprint);
          setSelectedSampleIds([]);
        },
      },
    );
  };

  const batchVoidInbounds = () => {
    if (!guardWrite()) return;
    const items = inboundItems
      .filter((item) => selectedInboundIds.includes(item.id))
      .map((item) => ({ id: item.id, expectedVersion: item.version }))
      .sort((left, right) => left.id - right.id);
    if (items.length !== selectedInboundIds.length || items.length === 0) return;
    const fingerprint = `inbound-void:${items.map((item) => `${item.id}@${item.expectedVersion}`).join(",")}`;
    actions.batchVoidInboundsMutation.mutate(
      {
        submissionKey: submissionKeyFor("inbound-void", fingerprint),
        items,
        reason: "样品库存入库记录批量删除",
      },
      {
        onSuccess: () => {
          clearKey("inbound-void", fingerprint);
          setSelectedInboundIds([]);
        },
      },
    );
  };

  const batchUpdateTracking = (trackingNumber: string) => {
    if (!guardWrite()) return;
    const items = selectedItems
      .map((item) => ({
        id: item.id,
        expectedVersion: item.version,
        trackingNumber,
      }))
      .sort((left, right) => left.id - right.id);
    if (items.length !== selectedIds.length || items.length === 0) return;
    const fingerprint = `outbound-tracking:${trackingNumber}:${items
      .map((item) => `${item.id}@${item.expectedVersion}`)
      .join(",")}`;
    actions.batchUpdateOutboundTrackingMutation.mutate(
      {
        submissionKey: submissionKeyFor("outbound-tracking", fingerprint),
        items,
      },
      {
        onSuccess: () => {
          clearKey("outbound-tracking", fingerprint);
          setSelectedIds([]);
        },
      },
    );
  };

  const batchEditPending = (values: SampleInventoryPendingBatchEdit) => {
    if (!guardWrite() || selectedStatus !== "pending") return;
    const items = selectedItems
      .map((item) => ({
        id: item.id,
        expectedVersion: item.version,
        ...values,
      }))
      .sort((left, right) => left.id - right.id);
    if (items.length !== selectedIds.length || items.length === 0) return;
    const fingerprint = `outbound-edit:${JSON.stringify(items)}`;
    actions.batchEditOutboundMutation.mutate(
      {
        submissionKey: submissionKeyFor("outbound-edit", fingerprint),
        items,
      },
      {
        onSuccess: () => {
          clearKey("outbound-edit", fingerprint);
          setSelectedIds([]);
        },
      },
    );
  };

  return {
    archiveOutbound,
    batchArchiveOutbounds,
    batchArchiveSamples,
    batchEditPending,
    batchTransition,
    batchUpdateTracking,
    batchVoidInbounds,
    selectedIds,
    selectedInboundIds,
    selectedSampleIds,
    selectedStatus,
    setSelectedIds,
    setSelectedInboundIds,
    setSelectedSampleIds,
  };
}
