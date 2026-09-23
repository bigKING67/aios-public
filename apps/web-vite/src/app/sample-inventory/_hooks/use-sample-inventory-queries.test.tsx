import type { PropsWithChildren } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchSampleInventoryInbounds,
  fetchSampleInventoryOutbounds,
  fetchSampleInventorySamples,
  fetchSampleInventorySettings,
  fetchSampleInventorySummary,
} from "../_lib/sample-inventory-api";
import { useSampleInventoryQueries } from "./use-sample-inventory-queries";

vi.mock("../_lib/sample-inventory-api", () => ({
  fetchSampleInventoryInbounds: vi.fn(),
  fetchSampleInventoryOutbounds: vi.fn(),
  fetchSampleInventorySamples: vi.fn(),
  fetchSampleInventorySettings: vi.fn(),
  fetchSampleInventorySummary: vi.fn(),
}));

const mockedSamples = vi.mocked(fetchSampleInventorySamples);
const mockedInbounds = vi.mocked(fetchSampleInventoryInbounds);
const mockedOutbounds = vi.mocked(fetchSampleInventoryOutbounds);
const mockedSettings = vi.mocked(fetchSampleInventorySettings);
const mockedSummary = vi.mocked(fetchSampleInventorySummary);
const queryClients: QueryClient[] = [];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  queryClients.push(queryClient);
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  expect(document.body).toBeEmptyDOMElement();
  vi.clearAllMocks();
  setVisibility("visible");
  mockedSettings.mockResolvedValue({
    lowStockThreshold: 3,
    refreshIntervalSeconds: 0,
    version: 1,
    updatedAt: "2026-07-27T00:00:00Z",
  });
  mockedSamples.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, summary: {} as never });
  mockedInbounds.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  mockedOutbounds.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  mockedSummary.mockResolvedValue({} as never);
});

afterEach(() => {
  // Vitest uses explicit imports, so Testing Library does not auto-register cleanup.
  cleanup();
  for (const queryClient of queryClients) queryClient.clear();
  queryClients.length = 0;
  vi.useRealTimers();
  setVisibility("visible");
});

describe("useSampleInventoryQueries visibility refresh", () => {
  it("polls visible inventory automatically even when the legacy setting is zero", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(
      () =>
        useSampleInventoryQueries({
          tab: "inventory",
          keyword: "",
          status: undefined,
          stockStatus: "all",
          productKind: "all",
          sortOrder: "default",
          dateFrom: "",
          dateTo: "",
          page: 1,
          pageSize: 20,
        }),
      { wrapper: createWrapper() },
    );

    await vi.waitFor(() => expect(mockedSummary).toHaveBeenCalledTimes(1));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    await vi.waitFor(() => expect(mockedSummary).toHaveBeenCalledTimes(2));
    unmount();
  });

  it("refreshes summary, sample options and only the visible page after visibility restoration", async () => {
    renderHook(
      () =>
        useSampleInventoryQueries({
          tab: "inventory",
          keyword: "",
          status: undefined,
          stockStatus: "all",
          productKind: "all",
          sortOrder: "default",
          dateFrom: "",
          dateTo: "",
          page: 1,
          pageSize: 20,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(mockedSummary).toHaveBeenCalledTimes(1);
      expect(mockedSamples).toHaveBeenCalledTimes(2);
    });
    expect(mockedInbounds).not.toHaveBeenCalled();
    expect(mockedOutbounds).not.toHaveBeenCalled();

    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));

    await waitFor(() => {
      expect(mockedSummary).toHaveBeenCalledTimes(2);
      expect(mockedSamples).toHaveBeenCalledTimes(4);
    });
    expect(mockedInbounds).not.toHaveBeenCalled();
    expect(mockedOutbounds).not.toHaveBeenCalled();
  });

  it("passes product kind and the selected page size to the inventory query", async () => {
    renderHook(
      () =>
        useSampleInventoryQueries({
          tab: "inventory",
          keyword: "gift",
          status: undefined,
          stockStatus: "low",
          productKind: "gift",
          sortOrder: "default",
          dateFrom: "",
          dateTo: "",
          page: 2,
          pageSize: 50,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() =>
      expect(mockedSamples).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: "gift",
          stockStatus: "low",
          productKind: "gift",
          page: 2,
          pageSize: 50,
        }),
        expect.any(AbortSignal),
      ),
    );
  });
});
