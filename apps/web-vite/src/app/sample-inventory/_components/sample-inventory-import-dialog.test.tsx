import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SampleInventoryImportModal } from "./sample-inventory-operation-dialogs";
import tableStyles from "../sample-inventory.module.css";

beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("SampleInventoryImportModal", () => {
  it.each([
    ["samples" as const, "导入新增Excel", "📥 下载新增样品模板"],
    ["inbounds" as const, "导入入库Excel", "📥 下载批量入库模板"],
  ])("renders the %s business label and template action", (kind, title, templateLabel) => {
    const onDownloadTemplate = vi.fn();
    render(
      <SampleInventoryImportModal
        open
        kind={kind}
        parsing={false}
        importing={false}
        onCancel={vi.fn()}
        onParse={vi.fn()}
        onImport={vi.fn()}
        onDownloadTemplate={onDownloadTemplate}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName(title);
    fireEvent.click(screen.getByRole("button", { name: templateLabel }));
    expect(onDownloadTemplate).toHaveBeenCalledOnce();
  });

  it("centers every import preview table header and body cell", () => {
    render(
      <SampleInventoryImportModal
        open
        kind="samples"
        preview={{
          kind: "samples",
          data: {
            rows: [
              {
                sampleCode: "S-001",
                sampleName: "测试样品",
                model: "M-001",
                category: null,
                location: null,
                remark: null,
                initialQuantity: 3,
              },
            ],
            issues: [],
            validCount: 1,
            invalidCount: 0,
          },
        }}
        parsing={false}
        importing={false}
        onCancel={vi.fn()}
        onParse={vi.fn()}
        onImport={vi.fn()}
        onDownloadTemplate={vi.fn()}
      />,
    );

    const headerCells = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(headerCells.map((cell) => cell.textContent?.trim())).toEqual([
      "样品编码",
      "样品名称",
      "分类",
      "期初库存",
    ]);
    expect(headerCells.every((cell) => cell.querySelector(".ant-table-column-sorter"))).toBe(true);
    expect(headerCells.every((cell) => cell.classList.contains(tableStyles.centeredTableHeaderCell))).toBe(true);
    expect(
      within(screen.getByRole("table"))
        .getAllByRole("cell")
        .every((cell) => cell.classList.contains(tableStyles.centeredTableBodyCell)),
    ).toBe(true);
  });
});
