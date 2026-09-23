import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SampleInventoryBatchActionsBar } from "./sample-inventory-batch-actions-bar";
import {
  installSampleInventoryWorkspaceTestEnvironment,
  pendingOutbound,
} from "./sample-inventory-workspace.test-support";
import { OutboundTable } from "./sample-inventory-tables";

installSampleInventoryWorkspaceTestEnvironment();

describe("SampleInventoryWorkspace outbound operations", () => {
  it("keeps the complete batch bar visible before rows are selected", () => {
    render(
      <SampleInventoryBatchActionsBar
        activeStatus="pending"
        selectedCount={0}
        onTransition={vi.fn()}
        onArchive={vi.fn()}
        onTracking={vi.fn()}
        onEditPending={vi.fn()}
      />,
    );

    expect(screen.getByText("⏳ 批量操作")).toBeInTheDocument();
    expect(screen.getByText("已选择 0 条 · 先勾选记录，表头复选框可全选当前页")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /批量通过/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /批量驳回/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /批量删除/ })).toBeDisabled();
    for (const label of ["批量申领人", "批量部门", "批量用途", "批量收货人", "批量地址"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("enables batch edit and tracking only after explicit targets and values are provided", () => {
    const onTransition = vi.fn();
    const { rerender } = render(
      <SampleInventoryBatchActionsBar
        activeStatus="pending"
        selectedCount={2}
        selectedStatus="pending"
        onTransition={onTransition}
        onArchive={vi.fn()}
        onTracking={vi.fn()}
        onEditPending={vi.fn()}
      />,
    );

    const editButton = screen.getByRole("button", { name: /批量编辑/ });
    expect(editButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("批量用途"), { target: { value: "统一测试用途" } });
    expect(editButton).toBeEnabled();
    expect(screen.getByText("已选择 2 条")).toBeInTheDocument();
    const approveButton = screen.getByRole("button", { name: /批量通过/ });
    expect(approveButton).toHaveAttribute("title", "审批通过后立即扣减对应库存，手工预留不变");
    fireEvent.click(approveButton);
    expect(onTransition).toHaveBeenCalledWith("approved");

    rerender(
      <SampleInventoryBatchActionsBar
        activeStatus="approved"
        selectedCount={2}
        selectedStatus="approved"
        onTransition={vi.fn()}
        onArchive={vi.fn()}
        onTracking={vi.fn()}
        onEditPending={vi.fn()}
      />,
    );
    const trackingButton = screen.getByRole("button", { name: /批量填单号/ });
    expect(screen.getByRole("button", { name: /批量已取样/ })).toHaveAttribute(
      "title",
      "确认取样只更新流程状态，库存不再变化",
    );
    expect(trackingButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("批量快递单号"), { target: { value: "SF-TEST-001" } });
    expect(trackingButton).toBeEnabled();
  });

  it("shows delete alongside edit, approve, and reject for pending rows", () => {
    const onTransition = vi.fn();
    render(
      <OutboundTable
        items={[pendingOutbound]}
        loading={false}
        total={1}
        page={1}
        pageSize={20}
        selectedIds={[]}
        resizableColumns={false}
        onSelectedIdsChange={vi.fn()}
        onPaginationChange={vi.fn()}
        onEdit={vi.fn()}
        onEditTracking={vi.fn()}
        onTransition={onTransition}
        onArchive={vi.fn()}
      />,
    );

    const tableScope = within(screen.getByRole("table"));
    const actionButtons = tableScope.getAllByRole("button", {
      name: /^(编辑|通过|驳回|删除)$/,
    });
    expect(actionButtons).toHaveLength(4);
    expect(actionButtons.map((button) => button.textContent?.trim())).toEqual([
      "编辑",
      "通过",
      "驳回",
      "删除",
    ]);
    const approveButton = actionButtons[1];
    expect(approveButton).toHaveAttribute(
      "title",
      `审批通过后立即扣减库存 ${pendingOutbound.quantity}，手工预留不变`,
    );
    fireEvent.click(approveButton);
    expect(onTransition).toHaveBeenCalledWith(pendingOutbound, "approved");
  });

  it("removes the action column from outbound records and makes every data column sortable", () => {
    render(
      <OutboundTable
        items={[pendingOutbound]}
        loading={false}
        total={1}
        page={1}
        pageSize={20}
        selectedIds={[]}
        resizableColumns
        selectableRows={false}
        showActions={false}
        onSelectedIdsChange={vi.fn()}
        onPaginationChange={vi.fn()}
        onEdit={vi.fn()}
        onEditTracking={vi.fn()}
        onTransition={vi.fn()}
        onArchive={vi.fn()}
      />,
    );

    const tableScope = within(screen.getByRole("table"));
    const headers = tableScope.getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent?.trim())).not.toContain("操作");
    expect(headers.filter((header) => header.querySelector(".ant-table-column-sorter"))).toHaveLength(11);
    expect(tableScope.queryByRole("checkbox")).not.toBeInTheDocument();
    const timeHeader = tableScope.getByRole("columnheader", { name: /时间/ });
    fireEvent.click(within(timeHeader).getByRole("separator", { name: "时间列宽" }));
    expect(timeHeader).not.toHaveAttribute("aria-sort");
    fireEvent.click(timeHeader);
    expect(timeHeader).toHaveAttribute("aria-sort", "ascending");
    expect(tableScope.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(tableScope.queryByRole("button", { name: "通过" })).not.toBeInTheDocument();
    expect(tableScope.queryByRole("button", { name: "驳回" })).not.toBeInTheDocument();
    expect(tableScope.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
  });

  it("adds tracking edit to approved rows and keeps the action wording explicit", () => {
    const approvedOutbound = {
      ...pendingOutbound,
      id: 41,
      status: "approved" as const,
      approvedAt: "2026-07-28T02:00:00Z",
    };
    const onEditTracking = vi.fn();
    const onTransition = vi.fn();
    render(
      <OutboundTable
        items={[approvedOutbound]}
        loading={false}
        total={1}
        page={1}
        pageSize={20}
        selectedIds={[]}
        resizableColumns={false}
        onSelectedIdsChange={vi.fn()}
        onPaginationChange={vi.fn()}
        onEdit={vi.fn()}
        onEditTracking={onEditTracking}
        onTransition={onTransition}
        onArchive={vi.fn()}
      />,
    );

    const tableScope = within(screen.getByRole("table"));
    const editTrackingButton = tableScope.getByRole("button", { name: "编辑单号" });
    const confirmSampleButton = tableScope.getByRole("button", { name: "确认取样" });
    const withdrawButton = tableScope.getByRole("button", { name: "撤回" });
    expect(editTrackingButton.querySelector(".anticon")).toBeInTheDocument();
    expect(confirmSampleButton.querySelector(".anticon")).toBeInTheDocument();
    expect(confirmSampleButton).toHaveAttribute("title", "确认取样只更新流程状态，库存不再变化");
    expect(withdrawButton).toHaveAttribute(
      "title",
      `撤回待审批后恢复库存 ${approvedOutbound.quantity}，手工预留不变`,
    );
    expect(tableScope.getByRole("button", { name: "删除" })).toBeInTheDocument();
    fireEvent.click(editTrackingButton);
    expect(onEditTracking).toHaveBeenCalledWith(approvedOutbound);
    fireEvent.click(confirmSampleButton);
    expect(onTransition).toHaveBeenCalledWith(approvedOutbound, "sampled");
  });

  it("lets imported legacy outbound rows use the current status operation matrix", () => {
    const legacySampled = {
      ...pendingOutbound,
      id: 42,
      receiver: "历史收货人",
      shippingAddress: "历史地址",
      status: "sampled" as const,
      timeQuality: "legacy_request_only",
    };
    const onTransition = vi.fn();
    render(
      <OutboundTable
        items={[legacySampled]}
        loading={false}
        total={1}
        page={1}
        pageSize={20}
        selectedIds={[]}
        resizableColumns={false}
        onSelectedIdsChange={vi.fn()}
        onPaginationChange={vi.fn()}
        onEdit={vi.fn()}
        onEditTracking={vi.fn()}
        onTransition={onTransition}
        onArchive={vi.fn()}
      />,
    );

    const tableScope = within(screen.getByRole("table"));
    expect(tableScope.queryByText("历史记录只读")).not.toBeInTheDocument();
    const returnButton = tableScope.getByRole("button", { name: "退回已审批" });
    const deleteButton = tableScope.getByRole("button", { name: "删除" });
    expect(returnButton.querySelector(".anticon")).toBeInTheDocument();
    expect(deleteButton.querySelector(".anticon")).toBeInTheDocument();
    expect(returnButton).toHaveAttribute("title", "仅回退流程状态，库存保持不变");
    fireEvent.click(returnButton);
    expect(onTransition).toHaveBeenCalledWith(legacySampled, "approved");
    expect(deleteButton).toBeInTheDocument();
    expect(tableScope.getByText("历史收货人")).toBeInTheDocument();
    expect(tableScope.getByText("历史地址")).toBeInTheDocument();
    expect(tableScope.getAllByRole("checkbox")[1]).toBeEnabled();

    const headers = tableScope
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());
    expect(headers).toEqual(
      expect.arrayContaining([
        "时间",
        "条码",
        "产品名称",
        "数量",
        "申领人",
        "部门",
        "用途",
        "收货人",
        "地址",
        "快递单号",
        "状态",
        "操作",
      ]),
    );
  });
});
