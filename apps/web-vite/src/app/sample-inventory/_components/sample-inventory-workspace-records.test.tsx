import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  availableSample,
  installSampleInventoryWorkspaceTestEnvironment,
  pendingOutbound,
  workspaceProps,
} from "./sample-inventory-workspace.test-support";
import { SampleInventoryWorkspace } from "./sample-inventory-workspace";

installSampleInventoryWorkspaceTestEnvironment();

const inboundRecord = {
  id: 72,
  sampleId: availableSample.id,
  sampleCode: availableSample.sampleCode,
  sampleName: availableSample.sampleName,
  quantity: 2,
  trackingNumber: "SF-READONLY-001",
  remark: "记录页只读",
  operatorName: "测试操作人",
  occurredAt: "2026-07-28T05:25:00Z",
  timeQuality: "exact" as const,
  version: 1,
  createdAt: "2026-07-28T05:25:00Z",
  voidedAt: null,
  voidReason: null,
};

const recordState = {
  keyword: "",
  status: "all" as const,
  stockStatus: "all" as const,
  productKind: "all" as const,
  sortOrder: "default" as const,
  dateFrom: "",
  dateTo: "",
  page: 1,
  pageSize: 20 as const,
};

describe("SampleInventoryWorkspace record actions", () => {
  it("keeps single and batch inbound delete actions visible on the inbound tab", async () => {
    const onVoidInbound = vi.fn();
    const onBatchVoidInbounds = vi.fn();
    const state = { ...recordState, tab: "inbound" as const };
    const legacyInbound = {
      ...inboundRecord,
      id: 71,
      quantity: 4,
      trackingNumber: null,
      remark: null,
      operatorName: "历史操作人",
      occurredAt: "2026-07-22T05:25:00Z",
      timeQuality: "legacy_local_minute" as const,
      createdAt: "2026-07-22T05:25:00Z",
    };
    const { rerender } = render(
      <SampleInventoryWorkspace
        {...workspaceProps({
          state,
          sampleOptions: [availableSample],
          inbounds: { items: [legacyInbound], total: 1, loading: false, error: null },
          onVoidInbound,
          onBatchVoidInbounds,
        })}
      />,
    );

    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "删除" }));
    expect(onVoidInbound).toHaveBeenCalledWith(legacyInbound);
    expect(screen.getByRole("button", { name: "🗑 批量删除入库记录" })).toBeDisabled();
    expect(screen.getByText("勾选左侧复选框后删除")).toBeInTheDocument();

    rerender(
      <SampleInventoryWorkspace
        {...workspaceProps({
          state,
          sampleOptions: [availableSample],
          inbounds: { items: [legacyInbound], total: 1, loading: false, error: null },
          selectedInboundIds: [legacyInbound.id],
          onVoidInbound,
          onBatchVoidInbounds,
        })}
      />,
    );

    expect(screen.getByText("已选择 1 条")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "🗑 批量删除入库记录" }));
    const confirmation = await screen.findByRole("tooltip");
    fireEvent.click(within(confirmation).getByRole("button", { name: "确认删除" }));
    expect(onBatchVoidInbounds).toHaveBeenCalledOnce();
  });

  it("keeps outbound and inbound record tabs read-only without row actions", () => {
    const { rerender } = render(
      <SampleInventoryWorkspace
        {...workspaceProps({
          state: { ...recordState, tab: "outbound-records" },
          outbounds: { items: [pendingOutbound], total: 1, loading: false, error: null },
        })}
      />,
    );

    let tableScope = within(screen.getByRole("table"));
    expect(tableScope.queryByRole("columnheader", { name: "操作" })).not.toBeInTheDocument();
    expect(tableScope.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /批量删除/ })).not.toBeInTheDocument();
    expect(tableScope.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();

    rerender(
      <SampleInventoryWorkspace
        {...workspaceProps({
          state: { ...recordState, tab: "inbound-records" },
          inbounds: { items: [inboundRecord], total: 1, loading: false, error: null },
        })}
      />,
    );

    tableScope = within(screen.getByRole("table"));
    expect(tableScope.queryByRole("columnheader", { name: "操作" })).not.toBeInTheDocument();
    expect(tableScope.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /批量删除/ })).not.toBeInTheDocument();
    expect(tableScope.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });
});
