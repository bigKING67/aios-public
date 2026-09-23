import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  fetchSampleInventoryInbounds,
  fetchSampleInventoryOutbounds,
  fetchSampleInventorySamples,
  fetchSampleInventorySettings,
  fetchSampleInventorySummary,
} from "../_lib/sample-inventory-api";
import { sampleInventoryQueryKeys } from "../_lib/sample-inventory-query-keys";
import {
  sampleInventoryDateEnd,
  sampleInventoryDateStart,
  type SampleInventoryUrlState,
} from "../_lib/sample-inventory-types";

const SAMPLE_OPTION_LIMIT = 100;
const LIVE_REFRESH_INTERVAL_MS = 15_000;

function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );

  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  return visible;
}

export function useSampleInventoryQueries(state: SampleInventoryUrlState) {
  const documentVisible = useDocumentVisibility();
  const settingsQuery = useQuery({
    queryKey: sampleInventoryQueryKeys.settings(),
    queryFn: fetchSampleInventorySettings,
  });
  // Inventory freshness is automatic; users cannot disable synchronization from settings.
  const refreshIntervalMs = documentVisible ? LIVE_REFRESH_INTERVAL_MS : false;

  const sampleOptionsQuery = useQuery({
    queryKey: sampleInventoryQueryKeys.samples({
      page: 1,
      pageSize: SAMPLE_OPTION_LIMIT,
    }),
    queryFn: ({ signal }) =>
      fetchSampleInventorySamples(
        {
          page: 1,
          pageSize: SAMPLE_OPTION_LIMIT,
        },
        signal,
      ),
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: false,
  });

  const summaryQuery = useQuery({
    queryKey: sampleInventoryQueryKeys.summary(),
    queryFn: ({ signal }) => fetchSampleInventorySummary(signal),
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: false,
  });

  const inventoryParams = useMemo(
    () => ({
      keyword: state.keyword || undefined,
      stockStatus: state.stockStatus === "all" ? undefined : state.stockStatus,
      productKind: state.productKind === "all" ? undefined : state.productKind,
      sortBy: state.sortOrder === "default" ? undefined : ("availableQuantity" as const),
      sortOrder: state.sortOrder === "default" ? undefined : state.sortOrder,
      page: state.page,
      pageSize: state.pageSize,
    }),
    [state.keyword, state.page, state.pageSize, state.productKind, state.sortOrder, state.stockStatus],
  );
  const inventoryQuery = useQuery({
    queryKey: sampleInventoryQueryKeys.samples(inventoryParams),
    queryFn: ({ signal }) => fetchSampleInventorySamples(inventoryParams, signal),
    enabled: state.tab === "inventory",
    placeholderData: keepPreviousData,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: false,
  });

  const outboundParams = useMemo(
    () => ({
      keyword: state.keyword || undefined,
      status: state.status === "all" ? undefined : state.status,
      dateFrom: state.tab === "outbound-records" ? sampleInventoryDateStart(state.dateFrom) : undefined,
      dateTo: state.tab === "outbound-records" ? sampleInventoryDateEnd(state.dateTo) : undefined,
      page: state.page,
      pageSize: state.pageSize,
    }),
    [state.dateFrom, state.dateTo, state.keyword, state.page, state.pageSize, state.status, state.tab],
  );
  const outboundQuery = useQuery({
    queryKey: sampleInventoryQueryKeys.outbounds(outboundParams),
    queryFn: ({ signal }) => fetchSampleInventoryOutbounds(outboundParams, signal),
    enabled: state.tab === "outbound" || state.tab === "outbound-records",
    placeholderData: keepPreviousData,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: false,
  });

  const inboundParams = useMemo(
    () => ({
      keyword: state.keyword || undefined,
      dateFrom: state.tab === "inbound-records" ? sampleInventoryDateStart(state.dateFrom) : undefined,
      dateTo: state.tab === "inbound-records" ? sampleInventoryDateEnd(state.dateTo) : undefined,
      page: state.page,
      pageSize: state.pageSize,
    }),
    [state.dateFrom, state.dateTo, state.keyword, state.page, state.pageSize, state.tab],
  );
  const inboundQuery = useQuery({
    queryKey: sampleInventoryQueryKeys.inbounds(inboundParams),
    queryFn: ({ signal }) => fetchSampleInventoryInbounds(inboundParams, signal),
    enabled: state.tab === "inbound" || state.tab === "inbound-records",
    placeholderData: keepPreviousData,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: false,
  });

  const previouslyVisibleRef = useRef(documentVisible);
  const refetchInbounds = inboundQuery.refetch;
  const refetchInventory = inventoryQuery.refetch;
  const refetchOutbounds = outboundQuery.refetch;
  const refetchSampleOptions = sampleOptionsQuery.refetch;
  const refetchSummary = summaryQuery.refetch;
  useEffect(() => {
    const becameVisible = documentVisible && !previouslyVisibleRef.current;
    previouslyVisibleRef.current = documentVisible;
    if (!becameVisible) return;

    void refetchSummary();
    void refetchSampleOptions();
    if (state.tab === "inventory") void refetchInventory();
    if (state.tab === "outbound" || state.tab === "outbound-records") {
      void refetchOutbounds();
    }
    if (state.tab === "inbound" || state.tab === "inbound-records") {
      void refetchInbounds();
    }
  }, [
    documentVisible,
    refetchInbounds,
    refetchInventory,
    refetchOutbounds,
    refetchSampleOptions,
    refetchSummary,
    state.tab,
  ]);

  return {
    inboundQuery,
    inventoryQuery,
    outboundQuery,
    pageSize: state.pageSize,
    sampleOptionsQuery,
    settingsQuery,
    summaryQuery,
  };
}
