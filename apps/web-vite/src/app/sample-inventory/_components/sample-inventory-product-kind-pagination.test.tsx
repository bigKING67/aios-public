import { App } from "antd";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SampleInventoryInbound } from "@/lib/generated-api-contract";
import { OutboundFormModal } from "./sample-inventory-dialogs";
import { SampleInventoryInboundTable } from "./sample-inventory-inbound-table";
import { InventoryTable } from "./sample-inventory-inventory-table";
import { SampleInventoryOutboundRegistration } from "./sample-inventory-outbound-registration";
import { OutboundTable } from "./sample-inventory-tables";
import {
  availableSample,
  installSampleInventoryWorkspaceTestEnvironment,
  pendingOutbound,
} from "./sample-inventory-workspace.test-support";
import registrationStyles from "../sample-inventory-registration.module.css";
import tableStyles from "../sample-inventory.module.css";

installSampleInventoryWorkspaceTestEnvironment();

const inbound: SampleInventoryInbound = {
  id: 71,
  sampleId: availableSample.id,
  sampleCode: availableSample.sampleCode,
  sampleName: availableSample.sampleName,
  quantity: 4,
  trackingNumber: null,
  remark: null,
  operatorName: "测试操作人",
  occurredAt: "2026-07-27T08:00:00Z",
  timeQuality: "known",
  version: 1,
  createdAt: "2026-07-27T08:00:00Z",
  voidedAt: null,
  voidReason: null,
};

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, "execCommand");

function setClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function setExecCommand(copy: () => boolean) {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn((command: string) => command === "copy" && copy()),
  });
}

afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
  if (execCommandDescriptor) Object.defineProperty(document, "execCommand", execCommandDescriptor);
  else Reflect.deleteProperty(document, "execCommand");
});

describe("sample inventory product kind and table pagination", () => {
  it("shows barcode, product name and derived kind as independent inventory columns", () => {
    render(
      <InventoryTable
        items={[
          availableSample,
          {
            ...availableSample,
            id: 8,
            sampleCode: "G-008",
            sampleName: "测试赠品",
            model: null,
            productKind: "gift",
          },
        ]}
        loading={false}
        total={2}
        page={1}
        pageSize={20}
        selectedIds={[]}
        onSelectedIdsChange={vi.fn()}
        onPaginationChange={vi.fn()}
        onEdit={vi.fn()}
        onAdjust={vi.fn()}
        onArchive={vi.fn()}
      />,
    );

    const headerCells = within(screen.getByRole("table")).getAllByRole("columnheader");
    const headers = headerCells.map((cell) => cell.textContent?.trim());
    expect(headers.filter(Boolean)).toEqual([
      "条码",
      "产品名称",
      "型号",
      "类别",
      "库存",
      "预留",
      "可用",
      "更新时间",
      "操作",
    ]);
    expect(headers).not.toContain("库位");
    expect(headerCells.filter((cell) => cell.querySelector(".ant-table-column-sorter"))).toHaveLength(8);
    expect(headerCells.every((cell) => cell.classList.contains(tableStyles.centeredTableHeaderCell))).toBe(true);
    expect(
      within(screen.getByRole("table"))
        .getAllByRole("cell")
        .every((cell) => cell.classList.contains(tableStyles.centeredTableBodyCell)),
    ).toBe(true);
    expect(screen.getByText("主品")).toBeInTheDocument();
    expect(screen.getByText("赠品")).toBeInTheDocument();
  });

  it("keeps legacy inbound rows selectable and exposes centered 20/50/100 pagination", async () => {
    const onPaginationChange = vi.fn();
    const onSelectedIdsChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <SampleInventoryInboundTable
        items={[{ ...inbound, timeQuality: "legacy_local_minute" }]}
        loading={false}
        total={26}
        page={1}
        pageSize={20}
        selectedIds={[]}
        onSelectedIdsChange={onSelectedIdsChange}
        onPaginationChange={onPaginationChange}
        onDelete={onDelete}
      />,
    );

    const table = screen.getByRole("table");
    const tableScope = within(table);
    const headerCells = tableScope.getAllByRole("columnheader");
    const headers = headerCells.map((cell) => cell.textContent?.trim());
    expect(headers).toEqual(expect.arrayContaining(["条码", "产品名称", "操作"]));
    expect(headerCells.filter((cell) => cell.querySelector(".ant-table-column-sorter"))).toHaveLength(8);
    expect(headerCells.every((cell) => cell.classList.contains(tableStyles.centeredTableHeaderCell))).toBe(true);
    expect(
      tableScope
        .getAllByRole("cell")
        .every((cell) => cell.classList.contains(tableStyles.centeredTableBodyCell)),
    ).toBe(true);
    expect(screen.queryByText("历史记录只读")).not.toBeInTheDocument();
    expect(screen.getByText("共 26 条")).toBeInTheDocument();

    const rowCheckbox = tableScope.getAllByRole("checkbox")[1];
    expect(rowCheckbox).not.toBeDisabled();
    fireEvent.click(rowCheckbox);
    expect(onSelectedIdsChange).toHaveBeenCalledWith([inbound.id]);
    fireEvent.click(tableScope.getByRole("button", { name: "删除" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: inbound.id }));

    const pageSizeSelector = screen.getByRole("combobox").parentElement;
    expect(pageSizeSelector).not.toBeNull();
    fireEvent.mouseDown(pageSizeSelector!);
    fireEvent.click(await screen.findByRole("option", { name: /50/ }));
    await waitFor(() => expect(onPaginationChange).toHaveBeenCalledWith(1, 50));
  });
});

describe("sample inventory outbound shipping fields", () => {
  it("uses the service low-stock flag to color the complete stock label", () => {
    render(
      <SampleInventoryOutboundRegistration
        samples={[
          availableSample,
          {
            ...availableSample,
            id: 8,
            sampleCode: "S-008",
            sampleName: "低库存主品",
            availableQuantity: 2,
            isLowStock: true,
          },
          {
            ...availableSample,
            id: 9,
            sampleCode: "G-009",
            sampleName: "低数量赠品",
            model: null,
            productKind: "gift",
            availableQuantity: 1,
            isLowStock: false,
          },
        ]}
        readOnly={false}
        submitting={false}
        onSubmit={vi.fn()}
      />,
    );

    const normalStock = screen.getByText("📦 库存：7 个");
    const lowStock = screen.getByText("📦 库存：2 个");
    const giftStock = screen.getByText("📦 库存：1 个");

    expect(normalStock).toHaveClass(registrationStyles.sampleStock);
    expect(normalStock).not.toHaveClass(registrationStyles.sampleStockLow);
    expect(lowStock).toHaveClass(
      registrationStyles.sampleStock,
      registrationStyles.sampleStockLow,
    );
    expect(lowStock).toHaveAttribute("title", "低库存预警");
    expect(giftStock).toHaveClass(registrationStyles.sampleStock);
    expect(giftStock).not.toHaveClass(registrationStyles.sampleStockLow);
  });

  it("rejects whitespace receiver and address in inline batch creation", async () => {
    const onSubmit = vi.fn();
    render(
      <SampleInventoryOutboundRegistration
        samples={[availableSample]}
        readOnly={false}
        submitting={false}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByText(availableSample.sampleName));
    fireEvent.change(screen.getByLabelText("申领人 *"), { target: { value: "申请人" } });
    fireEvent.change(screen.getByLabelText("部门 *"), { target: { value: "运营部" } });
    fireEvent.change(screen.getByLabelText("邮寄用途 *"), { target: { value: "展示" } });
    fireEvent.change(screen.getByLabelText("收货人 *"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("收货地址 *"), { target: { value: "\t" } });
    fireEvent.click(screen.getByRole("button", { name: /提交出库/ }));

    expect(await screen.findByText("请输入收货人")).toBeInTheDocument();
    expect(await screen.findByText("请输入收货地址")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires historical blank shipping fields before a full edit can be saved", async () => {
    const onSubmit = vi.fn();
    render(
      <OutboundFormModal
        open
        item={pendingOutbound}
        samples={[availableSample]}
        loading={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("请输入收货人")).toBeInTheDocument();
    expect(await screen.findByText("请输入收货地址")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("sample inventory outbound address copy", () => {
  function renderAddress(address: string | null) {
    render(
      <App>
        <OutboundTable
          items={[{ ...pendingOutbound, shippingAddress: address }]}
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
          onTransition={vi.fn()}
          onArchive={vi.fn()}
        />
      </App>,
    );
  }

  it("copies the complete address through Clipboard API and shows success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    renderAddress("浙江省杭州市测试路 88 号");

    fireEvent.click(screen.getByRole("button", { name: "复制地址" }));
    expect(writeText).toHaveBeenCalledWith("浙江省杭州市测试路 88 号");
    expect(await screen.findByText("地址已复制")).toBeInTheDocument();
  });

  it("falls back to execCommand when Clipboard API fails", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("clipboard denied")));
    setExecCommand(() => true);
    renderAddress("测试回退地址");

    fireEvent.click(screen.getByRole("button", { name: "复制地址" }));
    expect(await screen.findByText("地址已复制")).toBeInTheDocument();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("shows an observable error when both copy paths fail", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("clipboard denied")));
    setExecCommand(() => false);
    renderAddress("测试失败地址");

    fireEvent.click(screen.getByRole("button", { name: "复制地址" }));
    expect(await screen.findByText("复制失败，请手动复制")).toBeInTheDocument();
  });

  it("does not expose a copy action for an empty historical address", () => {
    renderAddress("   ");
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "复制地址" })).not.toBeInTheDocument();
  });
});
