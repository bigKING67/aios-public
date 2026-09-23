import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import {
  isOutboundStatus,
  isSampleInventoryProductKind,
  isSampleInventorySortOrder,
  isSampleInventoryStockStatus,
  isSampleInventoryTab,
  normalizeSampleInventoryDate,
  normalizeSampleInventoryPageSize,
  type SampleInventoryOutboundStatus,
  type SampleInventoryProductKind,
  type SampleInventorySortOrder,
  type SampleInventoryStockStatus,
  type SampleInventoryTab,
  type SampleInventoryUrlState,
} from "../_lib/sample-inventory-types";

type UrlStatePatch = Partial<Omit<SampleInventoryUrlState, "tab">>;
type TabState = Omit<SampleInventoryUrlState, "tab">;
type TabStateSnapshots = Partial<Record<SampleInventoryTab, TabState>>;

function readUrlState(searchParams: URLSearchParams): SampleInventoryUrlState {
  const rawPage = Number(searchParams.get("page"));
  const tab = isSampleInventoryTab(searchParams.get("tab"))
    ? (searchParams.get("tab") as SampleInventoryTab)
    : "outbound";
  const rawStatus = searchParams.get("status");
  return {
    tab,
    keyword: searchParams.get("keyword")?.trim() ?? "",
    status: isOutboundStatus(rawStatus)
      ? (rawStatus as SampleInventoryOutboundStatus)
      : rawStatus === "all"
        ? "all"
        : tab === "outbound"
          ? "pending"
          : undefined,
    stockStatus: isSampleInventoryStockStatus(searchParams.get("stockStatus"))
      ? (searchParams.get("stockStatus") as SampleInventoryStockStatus)
      : "all",
    productKind: isSampleInventoryProductKind(searchParams.get("productKind"))
      ? (searchParams.get("productKind") as SampleInventoryProductKind)
      : "all",
    sortOrder: isSampleInventorySortOrder(searchParams.get("sortOrder"))
      ? (searchParams.get("sortOrder") as SampleInventorySortOrder)
      : "default",
    dateFrom: normalizeSampleInventoryDate(searchParams.get("dateFrom")),
    dateTo: normalizeSampleInventoryDate(searchParams.get("dateTo")),
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: normalizeSampleInventoryPageSize(searchParams.get("pageSize")),
  };
}

function toTabState({ tab: _tab, ...state }: SampleInventoryUrlState): TabState {
  return state;
}

function defaultTabState(tab: SampleInventoryTab): TabState {
  return {
    keyword: "",
    status: tab === "outbound" ? "pending" : undefined,
    stockStatus: "all",
    productKind: "all",
    sortOrder: "default",
    dateFrom: "",
    dateTo: "",
    page: 1,
    pageSize: 20,
  };
}

function writeUrlState(current: URLSearchParams, state: SampleInventoryUrlState): URLSearchParams {
  const next = new URLSearchParams(current);
  if (state.tab === "outbound") next.delete("tab");
  else next.set("tab", state.tab);

  if (state.keyword) next.set("keyword", state.keyword.trim());
  else next.delete("keyword");
  if (state.status) next.set("status", state.status);
  else next.delete("status");
  if (state.stockStatus === "all") next.delete("stockStatus");
  else next.set("stockStatus", state.stockStatus);
  if (state.productKind === "all") next.delete("productKind");
  else next.set("productKind", state.productKind);
  if (state.sortOrder === "default") next.delete("sortOrder");
  else next.set("sortOrder", state.sortOrder);
  if (state.dateFrom) next.set("dateFrom", state.dateFrom);
  else next.delete("dateFrom");
  if (state.dateTo) next.set("dateTo", state.dateTo);
  else next.delete("dateTo");
  if (state.page > 1) next.set("page", String(state.page));
  else next.delete("page");
  if (state.pageSize === 20) next.delete("pageSize");
  else next.set("pageSize", String(state.pageSize));
  return next;
}

export function useSampleInventoryUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => readUrlState(searchParams), [searchParams]);
  const tabStateSnapshotsRef = useRef<TabStateSnapshots>({});

  useEffect(() => {
    tabStateSnapshotsRef.current[state.tab] = toTabState(state);
  }, [state]);

  const updateState = useCallback(
    (patch: UrlStatePatch) => {
      setSearchParams(
        (current) => {
          const currentState = readUrlState(current);
          const nextState = { ...currentState, ...patch };
          tabStateSnapshotsRef.current[nextState.tab] = toTabState(nextState);
          return writeUrlState(current, nextState);
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setTab = useCallback(
    (tab: SampleInventoryTab) => {
      setSearchParams(
        (current) => {
          const currentState = readUrlState(current);
          tabStateSnapshotsRef.current[currentState.tab] = toTabState(currentState);
          if (currentState.tab === tab) return current;

          const nextState = {
            tab,
            ...(tabStateSnapshotsRef.current[tab] ?? defaultTabState(tab)),
          };
          tabStateSnapshotsRef.current[tab] = toTabState(nextState);
          return writeUrlState(current, nextState);
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { state, setTab, updateState };
}
