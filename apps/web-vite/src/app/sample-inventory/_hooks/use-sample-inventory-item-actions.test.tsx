import type { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MessageInstance } from "antd/es/message/interface";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SampleInventoryInbound, SampleInventorySample } from "@/lib/generated-api-contract";
import {
  archiveSampleInventorySample,
  updateSampleInventorySample,
  voidSampleInventoryInbound,
} from "../_lib/sample-inventory-api";
import { sampleInventoryQueryKeys } from "../_lib/sample-inventory-query-keys";
import { useSampleInventoryActions } from "./use-sample-inventory-actions";

vi.mock("../_lib/sample-inventory-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/sample-inventory-api")>()),
  archiveSampleInventorySample: vi.fn(),
  updateSampleInventorySample: vi.fn(),
  voidSampleInventoryInbound: vi.fn(),
}));

const mockedArchiveSample = vi.mocked(archiveSampleInventorySample);
const mockedUpdateSample = vi.mocked(updateSampleInventorySample);
const mockedVoidInbound = vi.mocked(voidSampleInventoryInbound);

function sample(id: number): SampleInventorySample {
  return {
    id,
    sampleCode: `S-${id}`,
    sampleName: `样品 ${id}`,
    model: "M-1",
    category: null,
    productKind: "primary",
    location: null,
    remark: null,
    onHandQuantity: 5,
    reservedQuantity: 0,
    availableQuantity: 5,
    isLowStock: false,
    version: 1,
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
    archivedAt: null,
  };
}

function inbound(id: number): SampleInventoryInbound {
  return {
    id,
    sampleId: id,
    sampleCode: `S-${id}`,
    sampleName: `样品 ${id}`,
    quantity: 1,
    trackingNumber: null,
    remark: null,
    operatorName: "测试操作人",
    occurredAt: "2026-07-28T00:00:00Z",
    timeQuality: "known",
    version: 1,
    createdAt: "2026-07-28T00:00:00Z",
    voidedAt: null,
    voidReason: null,
  };
}

function renderActions(queryClient: QueryClient) {
  const messageApi = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  } as unknown as MessageInstance;
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSampleInventoryActions({ messageApi, setReadOnly: vi.fn() }), { wrapper });
}

describe("useSampleInventoryActions item caches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes archived samples from active caches while retaining inclusive history caches", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const visibleKey = sampleInventoryQueryKeys.samples({ page: 1, pageSize: 20 });
    const historyKey = sampleInventoryQueryKeys.samples({ includeArchived: true, page: 1, pageSize: 20 });
    const cached = sample(31);
    const archived = { ...cached, archivedAt: "2026-07-28T02:00:00Z", version: 2 };
    for (const queryKey of [visibleKey, historyKey]) {
      queryClient.setQueryData(queryKey, {
        items: [cached],
        total: 1,
        page: 1,
        pageSize: 20,
        summary: {} as never,
      });
    }
    mockedArchiveSample.mockResolvedValue(archived);
    const { result } = renderActions(queryClient);

    await act(async () => {
      await result.current.archiveSampleMutation.mutateAsync({
        sampleId: cached.id,
        payload: { submissionKey: "sample-archive-test", expectedVersion: cached.version },
      });
    });

    expect(queryClient.getQueryData<{ items: SampleInventorySample[]; total: number }>(visibleKey)).toMatchObject({
      items: [],
      total: 0,
    });
    expect(queryClient.getQueryData<{ items: SampleInventorySample[] }>(historyKey)?.items).toEqual([archived]);
    queryClient.clear();
  });

  it("removes a sample from an incompatible product-kind cache after model changes", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const giftKey = sampleInventoryQueryKeys.samples({ productKind: "gift", page: 1, pageSize: 20 });
    const allKey = sampleInventoryQueryKeys.samples({ page: 1, pageSize: 20 });
    const cached = { ...sample(35), model: null, productKind: "gift" };
    const updated = { ...cached, model: "M-35", productKind: "primary", version: 2 };
    for (const queryKey of [giftKey, allKey]) {
      queryClient.setQueryData(queryKey, {
        items: [cached],
        total: 1,
        page: 1,
        pageSize: 20,
        summary: {} as never,
      });
    }
    mockedUpdateSample.mockResolvedValue(updated);
    const { result } = renderActions(queryClient);

    await act(async () => {
      await result.current.updateSampleMutation.mutateAsync({
        sampleId: cached.id,
        payload: {
          submissionKey: "sample-update-kind-test",
          expectedVersion: cached.version,
          sampleCode: cached.sampleCode,
          sampleName: cached.sampleName,
          model: updated.model,
        },
      });
    });

    expect(queryClient.getQueryData<{ items: SampleInventorySample[]; total: number }>(giftKey)).toMatchObject({
      items: [],
      total: 0,
    });
    expect(queryClient.getQueryData<{ items: SampleInventorySample[] }>(allKey)?.items).toEqual([updated]);
    queryClient.clear();
  });

  it("removes voided inbound rows from normal caches and updates inclusive history caches", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const visibleKey = sampleInventoryQueryKeys.inbounds({ page: 1, pageSize: 20 });
    const historyKey = sampleInventoryQueryKeys.inbounds({ includeVoided: true, page: 1, pageSize: 20 });
    const cached = inbound(41);
    const voided = {
      ...cached,
      voidedAt: "2026-07-28T02:00:00Z",
      voidReason: "测试作废",
      version: 2,
    };
    for (const queryKey of [visibleKey, historyKey]) {
      queryClient.setQueryData(queryKey, { items: [cached], total: 1, page: 1, pageSize: 20 });
    }
    mockedVoidInbound.mockResolvedValue(voided);
    const { result } = renderActions(queryClient);

    await act(async () => {
      await result.current.voidInboundMutation.mutateAsync({
        inboundId: cached.id,
        payload: {
          submissionKey: "inbound-void-test",
          expectedVersion: cached.version,
          reason: "测试作废",
        },
      });
    });

    expect(queryClient.getQueryData<{ items: SampleInventoryInbound[]; total: number }>(visibleKey)).toMatchObject({
      items: [],
      total: 0,
    });
    expect(queryClient.getQueryData<{ items: SampleInventoryInbound[] }>(historyKey)?.items).toEqual([voided]);
    queryClient.clear();
  });
});
