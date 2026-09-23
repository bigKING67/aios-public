import type { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MessageInstance } from "antd/es/message/interface";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  batchArchiveSampleInventoryOutbounds,
  batchEditSampleInventoryOutbounds,
  batchTransitionSampleInventoryOutbounds,
  batchUpdateSampleInventoryOutboundTracking,
  transitionSampleInventoryOutbound,
  updateSampleInventoryOutbound,
} from "../_lib/sample-inventory-api";
import { sampleInventoryQueryKeys } from "../_lib/sample-inventory-query-keys";
import type { SampleInventoryOutboundView } from "../_lib/sample-inventory-types";
import { useSampleInventoryActions } from "./use-sample-inventory-actions";

vi.mock("../_lib/sample-inventory-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/sample-inventory-api")>()),
  batchArchiveSampleInventoryOutbounds: vi.fn(),
  batchEditSampleInventoryOutbounds: vi.fn(),
  batchTransitionSampleInventoryOutbounds: vi.fn(),
  batchUpdateSampleInventoryOutboundTracking: vi.fn(),
  transitionSampleInventoryOutbound: vi.fn(),
  updateSampleInventoryOutbound: vi.fn(),
}));

const mockedBatchArchiveOutbounds = vi.mocked(batchArchiveSampleInventoryOutbounds);
const mockedBatchEditOutbounds = vi.mocked(batchEditSampleInventoryOutbounds);
const mockedBatchTransitionOutbounds = vi.mocked(batchTransitionSampleInventoryOutbounds);
const mockedBatchUpdateTracking = vi.mocked(batchUpdateSampleInventoryOutboundTracking);
const mockedTransitionOutbound = vi.mocked(transitionSampleInventoryOutbound);
const mockedUpdateOutbound = vi.mocked(updateSampleInventoryOutbound);

function outbound(id: number): SampleInventoryOutboundView {
  return {
    id,
    sampleId: id,
    sampleCode: `S-${id}`,
    sampleName: `样品 ${id}`,
    quantity: 1,
    applicant: "测试申请人",
    department: "测试部门",
    purpose: "测试用途",
    receiver: null,
    shippingAddress: null,
    trackingNumber: null,
    status: "pending",
    requestedAt: "2026-07-28T00:00:00Z",
    approvedAt: null,
    sampledAt: null,
    rejectedAt: null,
    timeQuality: "known",
    version: 1,
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
  };
}

describe("useSampleInventoryActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes archived outbound rows from the visible cache immediately after success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const query = { status: "pending" as const, page: 1, pageSize: 20 };
    const queryKey = sampleInventoryQueryKeys.outbounds(query);
    const archived = outbound(1);
    const retained = outbound(2);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    queryClient.setQueryData(queryKey, {
      items: [archived, retained],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    mockedBatchArchiveOutbounds.mockResolvedValue({ items: [archived], updatedCount: 1 });

    const messageApi = {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    } as unknown as MessageInstance;
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useSampleInventoryActions({ messageApi, setReadOnly: vi.fn() }),
      { wrapper },
    );

    await act(async () => {
      await result.current.batchArchiveOutboundMutation.mutateAsync({
        submissionKey: "outbound-archive-test",
        items: [{ id: archived.id, expectedVersion: archived.version }],
      });
    });

    expect(queryClient.getQueryData(queryKey)).toEqual({
      items: [retained],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: sampleInventoryQueryKeys.samplesRoot(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: sampleInventoryQueryKeys.outboundsRoot(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: sampleInventoryQueryKeys.summary(),
    });
    expect(messageApi.success).toHaveBeenCalledWith("出库记录已删除，库存已按状态同步");
    queryClient.clear();
  });

  it("keeps outbound rows cached when archive fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const queryKey = sampleInventoryQueryKeys.outbounds({
      status: "pending",
      page: 1,
      pageSize: 20,
    });
    const cached = outbound(3);
    const cachedPage = {
      items: [cached],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    queryClient.setQueryData(queryKey, cachedPage);
    mockedBatchArchiveOutbounds.mockRejectedValue(new Error("fixture archive failure"));

    const messageApi = {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    } as unknown as MessageInstance;
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useSampleInventoryActions({ messageApi, setReadOnly: vi.fn() }),
      { wrapper },
    );

    await act(async () => {
      await expect(
        result.current.batchArchiveOutboundMutation.mutateAsync({
          submissionKey: "outbound-archive-failure",
          items: [{ id: cached.id, expectedVersion: cached.version }],
        }),
      ).rejects.toThrow("fixture archive failure");
    });

    expect(queryClient.getQueryData(queryKey)).toEqual(cachedPage);
    expect(messageApi.success).not.toHaveBeenCalled();
    expect(messageApi.error).toHaveBeenCalled();
    queryClient.clear();
  });

  it("replaces an edited outbound row in every cached list immediately", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const pendingKey = sampleInventoryQueryKeys.outbounds({ status: "pending", page: 1, pageSize: 20 });
    const allKey = sampleInventoryQueryKeys.outbounds({ page: 1, pageSize: 20 });
    const cached = outbound(10);
    const updated = { ...cached, applicant: "更新后的申领人", purpose: "批量测试", version: 2 };
    for (const queryKey of [pendingKey, allKey]) {
      queryClient.setQueryData(queryKey, { items: [cached], total: 1, page: 1, pageSize: 20 });
    }
    mockedUpdateOutbound.mockResolvedValue(updated);

    const messageApi = {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    } as unknown as MessageInstance;
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useSampleInventoryActions({ messageApi, setReadOnly: vi.fn() }),
      { wrapper },
    );

    await act(async () => {
      await result.current.updateOutboundMutation.mutateAsync({
        requestId: cached.id,
        payload: {
          submissionKey: "outbound-edit-test",
          expectedVersion: cached.version,
          sampleId: cached.sampleId,
          quantity: cached.quantity,
          applicant: updated.applicant,
          department: cached.department,
          purpose: updated.purpose,
          receiver: "测试收货人",
          shippingAddress: "测试收货地址",
        },
      });
    });

    expect(queryClient.getQueryData<{ items: SampleInventoryOutboundView[] }>(pendingKey)?.items[0]).toEqual(updated);
    expect(queryClient.getQueryData<{ items: SampleInventoryOutboundView[] }>(allKey)?.items[0]).toEqual(updated);
    queryClient.clear();
  });

  it("removes transitioned rows from the old status cache and updates the all-status cache", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const pendingKey = sampleInventoryQueryKeys.outbounds({ status: "pending", page: 1, pageSize: 20 });
    const allKey = sampleInventoryQueryKeys.outbounds({ page: 1, pageSize: 20 });
    const cached = outbound(11);
    const approved = { ...cached, status: "approved" as const, approvedAt: "2026-07-28T01:00:00Z", version: 2 };
    for (const queryKey of [pendingKey, allKey]) {
      queryClient.setQueryData(queryKey, { items: [cached], total: 1, page: 1, pageSize: 20 });
    }
    mockedTransitionOutbound.mockResolvedValue(approved);

    const messageApi = {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    } as unknown as MessageInstance;
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useSampleInventoryActions({ messageApi, setReadOnly: vi.fn() }),
      { wrapper },
    );

    await act(async () => {
      await result.current.transitionOutboundMutation.mutateAsync({
        requestId: cached.id,
        payload: {
          submissionKey: "outbound-transition-test",
          expectedVersion: cached.version,
          targetStatus: "approved",
        },
      });
    });

    expect(queryClient.getQueryData(pendingKey)).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(queryClient.getQueryData<{ items: SampleInventoryOutboundView[] }>(allKey)?.items[0]).toEqual(approved);
    queryClient.clear();
  });

  it("applies batch tracking, pending edits, and transitions to cached rows without polling", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const queryKey = sampleInventoryQueryKeys.outbounds({ status: "pending", page: 1, pageSize: 20 });
    const first = outbound(21);
    const second = outbound(22);
    queryClient.setQueryData(queryKey, { items: [first, second], total: 2, page: 1, pageSize: 20 });

    const tracked = [first, second].map((item) => ({ ...item, trackingNumber: "SF-BATCH", version: 2 }));
    const edited = tracked.map((item) => ({ ...item, department: "统一部门", version: 3 }));
    const rejected = edited.map((item) => ({ ...item, status: "rejected" as const, version: 4 }));
    mockedBatchUpdateTracking.mockResolvedValue({ items: tracked, updatedCount: 2 });
    mockedBatchEditOutbounds.mockResolvedValue({ items: edited, updatedCount: 2 });
    mockedBatchTransitionOutbounds.mockResolvedValue({ items: rejected, updatedCount: 2 });

    const messageApi = {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    } as unknown as MessageInstance;
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useSampleInventoryActions({ messageApi, setReadOnly: vi.fn() }),
      { wrapper },
    );

    await act(async () => {
      await result.current.batchUpdateOutboundTrackingMutation.mutateAsync({
        submissionKey: "batch-tracking-test",
        items: tracked.map((item) => ({
          id: item.id,
          expectedVersion: 1,
          trackingNumber: item.trackingNumber,
        })),
      });
    });
    expect(queryClient.getQueryData<{ items: SampleInventoryOutboundView[] }>(queryKey)?.items).toEqual(tracked);

    await act(async () => {
      await result.current.batchEditOutboundMutation.mutateAsync({
        submissionKey: "batch-edit-test",
        items: edited.map((item) => ({ id: item.id, expectedVersion: 2, department: item.department })),
      });
    });
    expect(queryClient.getQueryData<{ items: SampleInventoryOutboundView[] }>(queryKey)?.items).toEqual(edited);

    await act(async () => {
      await result.current.batchTransitionOutboundMutation.mutateAsync({
        submissionKey: "batch-transition-test",
        items: rejected.map((item) => ({ id: item.id, expectedVersion: 3 })),
        targetStatus: "rejected",
      });
    });
    expect(queryClient.getQueryData(queryKey)).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    queryClient.clear();
  });
});
