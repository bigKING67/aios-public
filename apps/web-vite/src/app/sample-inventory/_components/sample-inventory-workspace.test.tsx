import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  availableSample,
  installSampleInventoryWorkspaceTestEnvironment,
  pendingOutbound,
  workspaceProps,
} from "./sample-inventory-workspace.test-support";
import { SampleInventoryWorkspace } from "./sample-inventory-workspace";

installSampleInventoryWorkspaceTestEnvironment();

describe("SampleInventoryWorkspace", () => {
  it("renders all five operating tabs", () => {
    render(
      <SampleInventoryWorkspace
        {...workspaceProps({
          outbounds: { items: [], total: 0, loading: false, error: null },
        })}
      />,
    );

    const primaryNavigation = within(screen.getByRole("navigation", { name: "样品库存页面" }));
    for (const tab of ["出库登记", "库存", "入库", "出库记录", "入库记录"]) {
      const tabButton = primaryNavigation.getByRole("button", { name: tab });
      expect(tabButton).toBeInTheDocument();
      expect(tabButton.querySelector(".anticon")).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "📦 样品库存" })).toBeInTheDocument();
    expect(screen.queryByText("· 共享版")).not.toBeInTheDocument();
  });

  it("submits all supported pending batch-edit fields", () => {
    const onBatchEditPending = vi.fn();
    render(
      <SampleInventoryWorkspace
        {...workspaceProps({
          selectedIds: [pendingOutbound.id],
          selectedStatus: "pending",
          onBatchEditPending,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("批量申领人"), {
      target: { value: "新申领人" },
    });
    fireEvent.change(screen.getByLabelText("批量收货人"), {
      target: { value: "新收货人" },
    });
    fireEvent.change(screen.getByLabelText("批量地址"), {
      target: { value: "新地址" },
    });
    fireEvent.click(screen.getByRole("button", { name: /批量编辑/ }));
    expect(onBatchEditPending).toHaveBeenCalledWith({
      applicant: "新申领人",
      receiver: "新收货人",
      shippingAddress: "新地址",
    });
  });

  it("keeps the legacy inventory backup and restore actions", () => {
    const onBackup = vi.fn();
    const onRestore = vi.fn();
    const onInventorySortChange = vi.fn();
    render(
      <SampleInventoryWorkspace
        {...workspaceProps({
          state: {
            tab: "inventory",
            keyword: "",
            status: "all",
            stockStatus: "all",
            productKind: "all",
            sortOrder: "default",
            dateFrom: "",
            dateTo: "",
            page: 1,
            pageSize: 20,
          },
          outbounds: { items: [], total: 0, loading: false, error: null },
          onBackup,
          onRestore,
          onInventorySortChange,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /备份/ }));
    fireEvent.click(screen.getByRole("button", { name: /恢复/ }));
    fireEvent.click(screen.getByRole("button", { name: /可用升序/ }));

    expect(onBackup).toHaveBeenCalledOnce();
    expect(onRestore).toHaveBeenCalledOnce();
    expect(onInventorySortChange).toHaveBeenCalledWith("asc");
  });

  it("keeps sample import on inventory and moves inbound operations after confirm inbound", () => {
    const onOpenImport = vi.fn();
    const onOpenBatchInbound = vi.fn();
    const onDownload = vi.fn();
    const { rerender } = render(
      <SampleInventoryWorkspace
        {...workspaceProps({
          state: {
            tab: "inventory",
            keyword: "",
            status: "all",
            stockStatus: "all",
            productKind: "all",
            sortOrder: "default",
            dateFrom: "",
            dateTo: "",
            page: 1,
            pageSize: 20,
          },
          onOpenImport,
          onOpenBatchInbound,
          onDownload,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "📥 导入新增Excel" }));
    expect(onOpenImport).toHaveBeenCalledWith("samples");
    expect(screen.queryByRole("button", { name: "📥 批量入库" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "📥 导入入库Excel" })).not.toBeInTheDocument();

    rerender(
      <SampleInventoryWorkspace
        {...workspaceProps({
          state: {
            tab: "inbound",
            keyword: "",
            status: "all",
            stockStatus: "all",
            productKind: "all",
            sortOrder: "default",
            dateFrom: "",
            dateTo: "",
            page: 1,
            pageSize: 20,
          },
          sampleOptions: [availableSample],
          onOpenImport,
          onOpenBatchInbound,
          onDownload,
        })}
      />,
    );

    const inboundRegion = screen.getByRole("region", { name: "入库登记" });
    expect(
      within(inboundRegion)
        .getAllByRole("button")
        .map((button) => button.textContent?.trim())
        .filter(Boolean),
    ).toEqual(["✅ 确认入库", "📥 批量入库", "📥 导入入库Excel", "📊 导出Excel"]);
    fireEvent.click(within(inboundRegion).getByRole("button", { name: "📥 批量入库" }));
    fireEvent.click(within(inboundRegion).getByRole("button", { name: "📥 导入入库Excel" }));
    fireEvent.click(within(inboundRegion).getByRole("button", { name: "📊 导出Excel" }));
    expect(onOpenBatchInbound).toHaveBeenCalledOnce();
    expect(onOpenImport).toHaveBeenLastCalledWith("inbounds");
    expect(onDownload).toHaveBeenCalledWith("inbound-export");
  });

  it("dispatches the selected inventory kind and stock status filters", () => {
    const onStockStatusChange = vi.fn();
    const onProductKindChange = vi.fn();
    render(
      <SampleInventoryWorkspace
        {...workspaceProps({
          state: {
            tab: "inventory",
            keyword: "",
            status: "all",
            stockStatus: "all",
            productKind: "all",
            sortOrder: "default",
            dateFrom: "",
            dateTo: "",
            page: 1,
            pageSize: 20,
          },
          outbounds: { items: [], total: 0, loading: false, error: null },
          onStockStatusChange,
          onProductKindChange,
        })}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "库存状态" }));
    fireEvent.click(screen.getByText("主品低库存"));

    expect(onStockStatusChange.mock.calls[0]?.[0]).toBe("low");

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "类别" }));
    fireEvent.click(screen.getByText("赠品"));
    expect(onProductKindChange.mock.calls[0]?.[0]).toBe("gift");
  });

  it("batch-fills one tracking number for selected approved rows", () => {
    const onBatchTracking = vi.fn();
    render(
      <SampleInventoryWorkspace
        {...workspaceProps({
          outbounds: {
            items: [{ ...pendingOutbound, status: "approved" }],
            total: 1,
            loading: false,
            error: null,
          },
          selectedIds: [pendingOutbound.id],
          selectedStatus: "approved",
          onBatchTracking,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("批量快递单号"), {
      target: { value: "FIXTURE-TRACKING" },
    });
    fireEvent.click(screen.getByRole("button", { name: /批量填单号/ }));

    expect(onBatchTracking).toHaveBeenCalledWith("FIXTURE-TRACKING");
  });

  it("opens tracking-only editing for a sampled row without exposing the full edit action", () => {
    const sampledOutbound = {
      ...pendingOutbound,
      status: "sampled" as const,
      trackingNumber: null,
    };
    const onEditOutboundTracking = vi.fn();
    render(
      <SampleInventoryWorkspace
        {...workspaceProps({
          outbounds: {
            items: [sampledOutbound],
            total: 1,
            loading: false,
            error: null,
          },
          onEditOutboundTracking,
        })}
      />,
    );

    const trackingButton = screen.getByRole("button", { name: "填单号" });
    expect(trackingButton.querySelector(".anticon")).toBeInTheDocument();
    fireEvent.click(trackingButton);

    expect(onEditOutboundTracking).toHaveBeenCalledWith(sampledOutbound);
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("selects the whole sample card, enables its quantity, and submits one atomic batch", async () => {
    const onCreateOutboundBatch = vi.fn().mockResolvedValue(undefined);
    render(
      <SampleInventoryWorkspace
        {...workspaceProps({
          sampleOptions: [availableSample],
          onCreateOutboundBatch,
        })}
      />,
    );

    const quantity = screen.getByRole("spinbutton", {
      name: "测试样品出库数量",
    });
    expect(quantity).toBeDisabled();
    fireEvent.click(screen.getAllByText("测试样品")[0]);
    expect(quantity).toBeEnabled();
    fireEvent.change(quantity, { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("申领人 *"), {
      target: { value: "测试申请人" },
    });
    fireEvent.change(screen.getByLabelText("部门 *"), {
      target: { value: "测试部门" },
    });
    fireEvent.change(screen.getByLabelText("邮寄用途 *"), {
      target: { value: "陈列测试" },
    });
    fireEvent.change(screen.getByLabelText("收货人 *"), {
      target: { value: "测试收货人" },
    });
    fireEvent.change(screen.getByLabelText("收货地址 *"), {
      target: { value: "测试收货地址" },
    });
    fireEvent.click(screen.getByRole("button", { name: /提交出库/ }));

    await waitFor(() => expect(onCreateOutboundBatch).toHaveBeenCalledOnce());
    expect(onCreateOutboundBatch.mock.calls[0]?.[0]).toMatchObject({
      items: [
        {
          sampleId: availableSample.id,
          quantity: 3,
          applicant: "测试申请人",
          department: "测试部门",
          purpose: "陈列测试",
          receiver: "测试收货人",
          shippingAddress: "测试收货地址",
        },
      ],
    });
  });
});
